# Keyboard event ownership

Keyboard routing follows DOM focus and native bubbling, not a global list of feature priorities.

1. The focused control handles text editing, IME, and control navigation.
2. Its containing interaction region handles commands left unconsumed by the control.
3. Application shortcuts handle unconsumed application commands (search, settings, new session).

`useKeyboardScope(root, handle)` binds to a region root, consumes a command only when
`handle` returns true, and unregisters when the root changes or the component unmounts.
It ignores consumed and composing events. Child scopes therefore run before parent scopes.
Do not register feature commands on window/document, inspect unrelated components' DOM,
or use capture to outrank another region.

Session list: Escape clears its selection. Shift range selection focuses the list root
because cancelling the click suppresses normal link focus. Ordinary row/menu interactions
retain their native focus behavior. Moving focus into the composer does not cancel selection.

Composer: Escape interrupts its own running session only while focus is inside it.
It does not examine list selection or other composers. Editor-local shortcuts run first.

Portaled surfaces are separate DOM branches. Reka manages modal/menu/select focus and
Escape dismissal; they mark `data-keyboard-boundary` so application shortcuts do not escape
through their event path. Custom BTW content registers its own keyboard scope at its
portaled root. Closing it returns desktop focus to its trigger. Hidden surfaces cannot
receive focused keyboard events and need no global visibility checks.

Application shortcuts inspect only the current event's composed path and defaultPrevented.
The marker does not cancel native browser shortcuts or replace Reka dismissal.
Browser history/back-layer handling is separate from keyboard dispatch.

Regression coverage must include focus in another region, hidden surfaces, active surfaces,
IME, nested controls consuming keys, and removal of a scope. A synthetic document key event
without a focused region does not model a user's interaction.

Remaining document listeners have explicit application/gesture responsibilities:
input-modality tracking observes without consuming, hover hints dismiss presentation without
claiming the event, and attachment dragging temporarily owns Escape only for the active drag.
These are not a feature-priority dispatcher. Reka owns its portaled widget lifecycle.
