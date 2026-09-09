// Symbol keys for `provide`/`inject`. `clientId` is set once and never changes. `socket`
// is a ref because connection is deferred behind the name gate (see App.vue) — null until
// the player joins, then stays put. Phase views read `.value`, non-null by the time they mount.

import type PartySocket from 'partysocket'
import type { InjectionKey, ShallowRef } from 'vue'

export const socketKey: InjectionKey<ShallowRef<PartySocket | null>> = Symbol('socket')
export const clientIdKey: InjectionKey<string> = Symbol('clientId')
