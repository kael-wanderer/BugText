# Presentation mode results

1. Slide splitting, frontmatter, fences, heading modes and notes: `present-split.test.ts`.
2. Navigation, notes, black screen and leaving: `present-stage.test.ts`; fullscreen preservation and cursor slide: `present-controller.test.ts`. Native window size, cursor, scroll and split restoration: native check pending.
3. Preview rendering, math, diagrams, images, scaling and scroll: native check pending; basic fit: `present-fit.test.ts`.
4. Notes and hostile text: `present-split.test.ts`, `present-stage.test.ts`, `present-presenter.test.ts`.
5. Presenter state validation, UI, timer and placement: `present-protocol.test.ts`, `present-presenter.test.ts`, `presenter::tests::placement`; multiple displays and close lifecycle: native check pending.
6. Dirty state, undo and Recovery preservation: native check pending.
7. Two-display light and dark, bar, notes, laser, black screen, 30 slides: native check pending.

Validation: TypeScript check passed; Vitest 1,173 passed; Cargo 182 passed, 3 ignored. Production build emitted `presenter.html`; main entry chunk 616.86 kB (Vite also extracts shared chunks).

Known gaps requiring follow-up: one-presentation-per-app coordination, presenter number jumps and several presenter controls, native menu eligibility/routing, exact restoration and rendering parity need additional implementation or native verification. The mockup could not be opened in the browser because the browser access host was unavailable; its HTML was inspected.
