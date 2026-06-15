// Symbol keys for `provide`/`inject`. Set once at connection time and never
// change for the lifetime of the room view, so they don't need reactivity.

import type PartySocket from 'partysocket'
import type { InjectionKey } from 'vue'

export const socketKey: InjectionKey<PartySocket> = Symbol('socket')
export const clientIdKey: InjectionKey<string> = Symbol('clientId')
