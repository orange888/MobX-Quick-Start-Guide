import {
    observable,
    action,
    computed,
    runInAction,
    when,
    autorun,
    reaction,
} from 'mobx';
import React from 'react';
import LaptopMac from '@material-ui/icons/LaptopMac';
import Headset from '@material-ui/icons/Headset';
import Keyboard from '@material-ui/icons/Keyboard';
import { tracker } from './history';

class WorkflowStep {
    workflow = null;
    @observable loadState = 'none'; // pending | completed | failed
    @observable operationState = 'none'; // pending | completed | failed

    async getLoadOperation() {}
    async getMainOperation() {}

    @action.bound
    async load() {
        doAsync(
            () => this.getLoadOperation(),
            state => (this.loadState = state),
        );
    }

    @action.bound
    async perform() {
        doAsync(
            () => this.getMainOperation(),
            state => (this.operationState = state),
        );
    }
}

class ShowCartStep extends WorkflowStep {
    @observable.shallow items = [];

    @computed
    get itemTotal() {
        return this.items.reduce((sum, item) => sum + item.price, 0);
    }

    @action
    async getLoadOperation() {
        const items = await getCartItems();
        this.items = items;
    }

    @action
    async getMainOperation() {
        return await delay(1000);
    }
}

class MockWorkflowStep extends WorkflowStep {
    getLoadOperation() {
        return delay(1000);
    }

    getMainOperation() {
        return delay(1000);
    }
}
class ShoppingStep extends MockWorkflowStep {}
class PaymentStep extends MockWorkflowStep {}
class ConfirmStep extends MockWorkflowStep {}
class TrackStep extends MockWorkflowStep {
    async getMainOperation() {
        await delay(500);
        runInAction(() => (this.workflow.currentStep = 'shopping'));
    }
}

const routes = {
    shopping: { path: '/', label: 'Show Cart' },
    cart: { path: '/cart', label: 'Shopping Cart' },
    payment: { path: '/payment', label: 'Make Payment' },
    confirm: { path: '/confirm', label: 'Confirm Order' },
    track: { path: '/track', label: 'Track Order' },
};

export class CheckoutWorkflow {
    static steps = [
        { name: 'shopping', stepClass: ShoppingStep },
        { name: 'cart', stepClass: ShowCartStep },
        { name: 'payment', stepClass: PaymentStep },
        { name: 'confirm', stepClass: ConfirmStep },
        { name: 'track', stepClass: TrackStep },
    ];

    nextStepPromise = null;

    @observable currentStep = null;
    @observable.ref step = null;

    constructor() {
        tracker.startListening(routes);

        this.currentStep = tracker.page;

        autorun(async () => {
            const currentStep = this.currentStep;

            const stepIndex = CheckoutWorkflow.steps.findIndex(
                x => x.name === currentStep,
            );

            if (stepIndex !== -1) {
                this.loadStep(stepIndex);

                tracker.page = CheckoutWorkflow.steps[stepIndex].name;
            }
        });

        reaction(
            () => tracker.page,
            page => {
                this.currentStep = page;
            },
        );
    }

    @action
    async loadStep(stepIndex) {
        if (this.nextStepPromise) {
            this.nextStepPromise.cancel();
        }

        const StepClass = CheckoutWorkflow.steps[stepIndex].stepClass;
        this.step = new StepClass();
        this.step.workflow = this;
        this.step.load();
        this.nextStepPromise = when(
            () => this.step.operationState === 'completed',
        );

        await this.nextStepPromise;

        const nextStepIndex = stepIndex + 1;
        if (nextStepIndex >= CheckoutWorkflow.steps.length) {
            return;
        }

        this.currentStep = CheckoutWorkflow.steps[nextStepIndex].name;
    }
}

async function getCartItems() {
    await delay(500);

    return [
        { title: 'Laptop', price: 999, icon: LaptopMac },
        { title: 'Headset', price: 99, icon: Headset },
        { title: 'Keyboard', price: 49, icon: Keyboard },
    ];
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function doAsync(getPromise, setState) {
    setState('pending');
    try {
        await getPromise();
        runInAction(() => {
            setState('completed');
        });
    } catch (e) {
        runInAction(() => {
            setState('failed');
        });
    }
}
