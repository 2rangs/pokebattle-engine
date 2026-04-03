import type { Action, PlayerID } from '../types/battle'

export class ActionQueue {
    private queue: Action[] = []

    add(action: Action): void {
        const idx = this.queue.findIndex(a => a.player === action.player)
        if (idx !== -1) {
            this.queue[idx] = action
        } else {
            this.queue.push(action)
        }
    }

    remove(player: PlayerID): void {
        this.queue = this.queue.filter(a => a.player !== player)
    }

    getAll(): Action[] {
        return [...this.queue]
    }

    has(player: PlayerID): boolean {
        return this.queue.some(a => a.player === player)
    }

    clear(): void {
        this.queue = []
    }

    get size(): number {
        return this.queue.length
    }
}