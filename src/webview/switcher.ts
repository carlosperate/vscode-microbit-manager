/**
 * The strip: a segmented control with one segment per mode and a thumb that
 * slides to the active one. Everything drawn comes from the last `state` the
 * host posted. A click moves the thumb at once and asks the host, whose answer
 * is the state that confirms it, so a refusal simply slides it back.
 */
import type { FromSwitcher, Segment, ToSwitcher } from './protocol';
import './switcher.css';

const vscode = acquireVsCodeApi();
const post = (message: FromSwitcher) => vscode.postMessage(message);

const root = document.getElementById('root') ?? document.body;
const strip = document.createElement('div');
strip.className = 'strip';
strip.setAttribute('role', 'radiogroup');
strip.setAttribute('aria-label', 'Mode');
const thumb = document.createElement('div');
thumb.className = 'thumb';
strip.append(thumb);

// The nudge line and its link are built once; only their words and target change.
const nudgeLine = document.createElement('p');
nudgeLine.className = 'nudge';
nudgeLine.hidden = true;
const nudgeText = document.createTextNode('');
const nudgeLink = document.createElement('button');
nudgeLink.type = 'button';
nudgeLink.className = 'link';
let nudgeTarget: string | undefined;
nudgeLink.addEventListener('click', () => nudgeTarget && choose(nudgeTarget));
nudgeLine.append(nudgeText, nudgeLink);

root.append(strip, nudgeLine);

let state: ToSwitcher | undefined;
const segments = new Map<string, HTMLButtonElement>();

/** A radio group: the arrows move the selection, not just the focus. */
const STEP: Readonly<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

window.addEventListener('message', (event: MessageEvent<ToSwitcher>) => {
	if (event.data?.type === 'state') render(event.data);
});

function render(next: ToSwitcher): void {
	// The same modes keep their buttons, so the thumb slides rather than reappears.
	const sameModes =
		state !== undefined &&
		next.modes.length === state.modes.length &&
		next.modes.every((mode, at) => mode.id === state?.modes[at]?.id);
	const sameActive = state !== undefined && next.active === state.active;
	state = next;
	if (!sameModes) build(next.modes);
	// Writing an unchanged label would still replace the text node and dirty layout.
	for (const mode of next.modes) {
		const segment = segments.get(mode.id);
		if (segment && segment.textContent !== mode.label) {
			segment.textContent = mode.label;
			segment.title = mode.label;
		}
	}
	if (!sameModes || !sameActive) {
		select(next.active);
		placeThumb(sameModes);
	}
	nudge(next.nudge);
}

function build(modes: readonly Segment[]): void {
	for (const segment of segments.values()) segment.remove();
	segments.clear();
	for (const mode of modes) {
		const segment = document.createElement('button');
		segment.type = 'button';
		segment.className = 'segment';
		segment.setAttribute('role', 'radio');
		segment.addEventListener('click', () => choose(mode.id));
		segment.addEventListener('keydown', (event) => onKey(event, mode.id));
		segments.set(mode.id, segment);
		strip.append(segment);
	}
}

/** The visible selection: which segment is checked, and the one tab stop the arrows move within. */
function select(active: string | undefined): void {
	for (const [id, segment] of segments) {
		const checked = id === active;
		segment.setAttribute('aria-checked', String(checked));
		segment.tabIndex = checked ? 0 : -1;
	}
}

/** Reads the active segment's geometry, so it forces layout: called on a change, never per frame otherwise. */
function placeThumb(animate: boolean): void {
	const target = state?.active ? segments.get(state.active) : undefined;
	if (!target) {
		thumb.style.opacity = '0';
		return;
	}
	if (!animate) settle();
	thumb.style.opacity = '1';
	thumb.style.transform = `translateX(${target.offsetLeft}px)`;
	thumb.style.width = `${target.offsetWidth}px`;
}

// A first draw and a resize snap without the slide. The class comes off two
// frames later, once per burst: a drag resizes every frame, and queueing the
// removal each time would stack callbacks for nothing.
let settling = false;
function settle(): void {
	strip.classList.add('settling');
	if (settling) return;
	settling = true;
	requestAnimationFrame(() =>
		requestAnimationFrame(() => {
			strip.classList.remove('settling');
			settling = false;
		})
	);
}

/** Slides first and asks second, so the strip answers the click before the host does. */
function choose(id: string): void {
	if (!state || id === state.active) return;
	state = { ...state, active: id };
	select(id);
	placeThumb(true);
	segments.get(id)?.focus();
	post({ type: 'switch', id });
}

function onKey(event: KeyboardEvent, id: string): void {
	if (!state) return;
	const ids = state.modes.map((mode) => mode.id);
	const at = ids.indexOf(id);
	const delta = STEP[event.key];
	let next: string | undefined;
	if (delta !== undefined) next = ids[(at + delta + ids.length) % ids.length];
	else if (event.key === 'Home') next = ids[0];
	else if (event.key === 'End') next = ids[ids.length - 1];
	if (next === undefined) return;
	event.preventDefault();
	choose(next);
}

function nudge(mode: Segment | undefined): void {
	nudgeLine.hidden = !mode;
	nudgeTarget = mode?.id;
	if (!mode) return;
	nudgeText.textContent = `This looks like a ${mode.label} project. `;
	nudgeLink.textContent = `Switch to ${mode.label}`;
}

// A narrower sidebar moves every segment, and the thumb has to follow without a slide.
if (typeof ResizeObserver !== 'undefined') {
	new ResizeObserver(() => placeThumb(false)).observe(strip);
}

post({ type: 'ready' });
