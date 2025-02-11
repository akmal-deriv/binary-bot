/* eslint-disable max-classes-per-file */
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import { api_base } from '@api-base';
import { translate } from '@i18n';
import { observer as globalObserver } from '@utilities/observer';
import { durationToSecond } from '@utils';
import { createError } from '../../../botPage/common/error';
import { expectInitArg, expectTradeOptions } from '../sanitize';
import Proposal from './Proposal';
import Total from './Total';
import Balance from './Balance';
import OpenContract from './OpenContract';
import Sell from './Sell';
import Purchase from './Purchase';
import Ticks from './Ticks';
import rootReducer from './state/reducers';
import * as constants from './state/constants';
import { start } from './state/actions';

const watchBefore = store =>
    watchScope({
        store,
        stopScope: constants.DURING_PURCHASE,
        passScope: constants.BEFORE_PURCHASE,
        passFlag: 'proposalsReady',
    });

const watchDuring = store =>
    watchScope({
        store,
        stopScope: constants.STOP,
        passScope: constants.DURING_PURCHASE,
        passFlag: 'openContract',
    });

/* The watchScope function is called randomly and resets the prevTick
 * which leads to the same problem we try to solve. So prevTick is isolated
 */
let prevTick;
const watchScope = ({ store, stopScope, passScope, passFlag }) => {
    // in case watch is called after stop is fired
    if (store.getState().scope === stopScope) {
        return Promise.resolve(false);
    }
    return new Promise(resolve => {
        const unsubscribe = store.subscribe(() => {
            const newState = store.getState();

            if (newState.newTick === prevTick) return;
            prevTick = newState.newTick;

            if (newState.scope === passScope && newState[passFlag]) {
                unsubscribe();
                resolve(true);
            }

            if (newState.scope === stopScope) {
                unsubscribe();
                resolve(false);
            }
        });
    });
};

export default class TradeEngine extends Balance(Purchase(Sell(OpenContract(Proposal(Ticks(Total(class {}))))))) {
    constructor($scope) {
        super();
        this.observer = $scope.observer;
        this.$scope = $scope;
        this.observe();
        this.data = {
            contract: {},
            proposals: [],
            forgetProposalIds: [],
        };
        this.store = createStore(rootReducer, applyMiddleware(thunk));
    }

    init(...args) {
        const [token, options] = expectInitArg(args);
        const { symbol } = options;

        this.initArgs = args;
        this.options = options;
        this.startPromise = this.loginAndGetBalance(token);
        this.watchTicks(symbol);
    }

    start(tradeOptions) {
        if (!this.options) {
            throw createError('NotInitialized', translate('Bot.init is not called'));
        }

        globalObserver.emit('bot.running');
        globalObserver.setState({ isRunning: true });

        this.tradeOptions = expectTradeOptions(tradeOptions);
        this.store.dispatch(start());
        this.checkLimits(tradeOptions);
        this.makeProposals({ ...this.options, ...tradeOptions });
        this.checkProposalReady();
    }

    loginAndGetBalance(token) {
        if (this.token === token) return Promise.resolve();
        return new Promise(resolve => {
            api_base.api.expectResponse('authorize').then(({ authorize }) => {
                this.accountInfo = authorize;
                this.token = token;
                resolve();
            });
        }).catch(error => {
            globalObserver.emit('Error', error);
        });
    }

    getContractDuration() {
        const { duration, duration_unit } = this.tradeOptions;
        return durationToSecond(`${duration}${duration_unit}`);
    }

    observe() {
        this.observeOpenContract();
        this.observeBalance();
        this.observeProposals();
    }

    watch(watchName) {
        if (watchName === 'before') {
            return watchBefore(this.store);
        }
        return watchDuring(this.store);
    }

    getData() {
        return this.data;
    }
}
