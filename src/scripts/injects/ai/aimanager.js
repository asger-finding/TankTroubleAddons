var AIManager = Classy.newClass(); // eslint-disable-line no-var

AIManager.fields({
    aiId: null,
    gameController: null,
    ai: null,
    storedStates: {}
});

AIManager.constructor(function(aiId, config, gameController) {
    this.aiId = aiId;
    this.gameController = gameController;

    this.ai = AI.create(aiId, config, gameController);

    this.reset();
});

AIManager.methods({
    getAIId: function() {
        return this.aiId;
    },

    getGameId: function() {
        return this.gameController.getId();
    },

    update: function(deltaTime) {
        this.ai.update(deltaTime);

        const newInputState = this.ai.getInputState();

        let stateChanged = false;
        stateChanged |= this.storedStates["forward"] !== newInputState.getForward();
        stateChanged |= this.storedStates["back"] !== newInputState.getBack();
        stateChanged |= this.storedStates["left"] !== newInputState.getLeft();
        stateChanged |= this.storedStates["right"] !== newInputState.getRight();
        stateChanged |= this.storedStates["fire"] !== newInputState.getFire();

        if (stateChanged) {
            this.gameController.setInputState(newInputState);
        }

        this.storedStates["forward"] = newInputState.getForward();
        this.storedStates["back"] = newInputState.getBack();
        this.storedStates["left"] = newInputState.getLeft();
        this.storedStates["right"] = newInputState.getRight();
        this.storedStates["fire"] = newInputState.getFire();
    },

    shutdown: function() {
        this.ai.shutdown();
    },

    reset: function() {
        this.storedStates["forward"] = false;
        this.storedStates["back"] = false;
        this.storedStates["left"] = false;
        this.storedStates["right"] = false;
        this.storedStates["fire"] = false;
    }
});

if (typeof module === 'object') {
    module.exports = AIManager;
}
