// Symbol keys for `provide`/`inject`. `clientId` is set once and never changes.
// `socket` is a ref because connection is now deferred behind the name gate
// (see App.vue) — it's null until the player joins, then stays put. Descendants
// inject the ref and read `.value` (non-null by the time any phase view mounts,
// since they only render once server state arrives).

import type PartySocket from 'partysocket'
import type { InjectionKey, ShallowRef } from 'vue'

export const socketKey: InjectionKey<ShallowRef<PartySocket | null>> = Symbol('socket')
export const clientIdKey: InjectionKey<string> = Symbol('clientId')
