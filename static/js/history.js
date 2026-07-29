class HistoryManager {
    constructor(maxSize = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
        this.isExecuting = false;
        this.dragTimeout = null;
    }

    push(state) {
        if (this.isExecuting) return;

        const serialized = JSON.stringify(state);
        const currentTop = this.undoStack[this.undoStack.length - 1];
        if (currentTop === serialized) return;

        this.undoStack.push(serialized);
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    recordDrag(state, delay = 500) {
        if (this.dragTimeout) {
            clearTimeout(this.dragTimeout);
        }
        this.dragTimeout = setTimeout(() => {
            this.push(state);
        }, delay);
    }

    undo(applyCallback) {
        if (this.undoStack.length <= 1 || this.isExecuting) return false;

        this.isExecuting = true;
        try {
            const currentState = this.undoStack.pop();
            this.redoStack.push(currentState);

            const previousState = JSON.parse(this.undoStack[this.undoStack.length - 1]);
            applyCallback(previousState);
            return true;
        } finally {
            this.isExecuting = false;
        }
    }

    redo(applyCallback) {
        if (this.redoStack.length === 0 || this.isExecuting) return false;

        this.isExecuting = true;
        try {
            const nextState = this.redoStack.pop();
            this.undoStack.push(nextState);

            const stateObj = JSON.parse(nextState);
            applyCallback(stateObj);
            return true;
        } finally {
            this.isExecuting = false;
        }
    }

    canUndo() {
        return this.undoStack.length > 1;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.isExecuting = false;
    }
}

window.roadmapHistory = new HistoryManager();