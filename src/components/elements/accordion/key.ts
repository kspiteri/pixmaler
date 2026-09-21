import type { InjectionKey, Ref } from 'vue'

// Shared contract between Accordion (provides) and Item (injects). Single-open: `openId` is the
// one expanded item, or null when all are collapsed.
export interface AccordionCtx {
  openId: Ref<string | null>
  toggle: (id: string) => void
}

export const accordionKey: InjectionKey<AccordionCtx> = Symbol('accordion')
