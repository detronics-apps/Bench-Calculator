/**
 * "How this works" - the teaching panel under each tool.
 *
 * Written for someone meeting this for the first time, a school student
 * included: what the component is, why anyone needs the tool, then the
 * formula, then the same formula worked through with whatever numbers are
 * on screen at that moment. Seeing your own values in the arithmetic is what
 * turns a formula from a symbol into something you can check by hand.
 */

import { el, clear } from './dom.js';
import { getState, setState } from '../state.js';
import { formatOhms, formatVolts, formatAmps, formatWatts, formatEng } from '../units.js';
import { colorById, bandRoles } from '../bands.js';
import { unitFor } from '../combine.js';
import { formatDuration } from '../battery.js';

import { decode as decodeColour } from './tools/colour.js';
import { decode as decodeSmd } from './tools/smd.js';
import { solve as solveLedState, packFor, runtimeFor, supplyVoltage } from './tools/led.js';
import { result as combineResult } from './tools/combine.js';

/* ------------------------------------------------------------- content */

function colourExplainer(state) {
  const r = decodeColour();
  const bands = state.colour.bands;
  const roles = bandRoles(bands.length);
  const digits = roles
    .map((role, i) => (role === 'digit' ? colorById(bands[i]) : null))
    .filter(Boolean);
  const multIndex = roles.indexOf('multiplier');
  const mult = colorById(bands[multIndex]);

  const digitWords = digits.map((c) => `${c.name} = ${c.digit}`).join(', ');
  const digitNumber = digits.map((c) => c.digit).join('');

  return {
    title: 'How resistor colour codes work',
    intro: 'A resistor is a component that holds back electric current, the way a narrow '
      + 'section of pipe holds back water. How much it holds back is measured in ohms (Ω). '
      + 'Resistors are far too small to print a number on, and printed ink rubs off, so '
      + 'manufacturers paint coloured rings around them instead. This tool reads those rings '
      + 'for you, and works backwards too.',
    blocks: [
      {
        heading: 'Every colour stands for a number',
        body: 'The ten colours black, brown, red, orange, yellow, green, blue, violet, grey '
          + 'and white mean 0 to 9, in that order. It is the order of the rainbow with black '
          + 'and brown at the dark end and grey and white at the light end, which is how most '
          + 'people remember it.',
      },
      {
        heading: 'The bands are not all the same kind',
        body: 'The first two or three bands are digits. The next band is the multiplier: it '
          + 'says how many zeros to write after those digits. The last band is the tolerance, '
          + 'which is how far from the marked value the real resistor is allowed to be.',
        formula: 'resistance = digits × multiplier',
      },
      r.ok ? {
        heading: 'Your resistor, worked through',
        example: [
          `Digit bands: ${digitWords}, so the digits are ${digitNumber}.`,
          `Multiplier band: ${mult.name} = ×${mult.multiplier}.`,
          `${digitNumber} × ${mult.multiplier} = ${formatOhms(r.ohms)}.`,
          `Tolerance: ±${r.tolerancePct}%, so a real one measures somewhere between `
            + `${formatOhms(r.min)} and ${formatOhms(r.max)}.`,
        ],
      } : null,
      {
        heading: 'Why tolerance matters',
        body: 'Nothing is made perfectly. A ±5% resistor marked 100 Ω might really be anywhere '
          + 'from 95 Ω to 105 Ω. Usually that is fine. Sometimes it is not, and then you pay '
          + 'more for a ±1% part. The tighter the tolerance, the more bands the resistor needs, '
          + 'because it has to carry a third digit.',
      },
      {
        heading: 'Why use a tool instead of your eyes',
        body: 'Brown, red and orange look alike under a desk lamp, and a resistor read backwards '
          + 'gives a completely different answer. Getting it wrong can destroy the part you are '
          + 'protecting. Checking here takes a second and removes the doubt.',
      },
    ].filter(Boolean),
  };
}

function smdExplainer(state) {
  const r = decodeSmd();
  return {
    title: 'How surface-mount markings work',
    intro: 'Surface-mount resistors are the tiny black rectangles soldered flat onto a circuit '
      + 'board — some are smaller than a grain of rice. There is no room for coloured rings, so '
      + 'they get a short code printed on top instead. There are three common systems, and this '
      + 'tool reads all of them.',
    blocks: [
      {
        heading: '3-digit codes',
        body: 'The first two characters are digits. The third says how many zeros follow.',
        formula: 'resistance = (first two digits) × 10 ^ (third digit)',
        example: ['473 means 47 followed by 3 zeros, so 47 000 Ω = 47 kΩ.'],
      },
      {
        heading: '4-digit codes',
        body: 'The same idea with an extra digit of precision, used on 1% parts.',
        formula: 'resistance = (first three digits) × 10 ^ (fourth digit)',
        example: ['4702 means 470 followed by 2 zeros, so 47 000 Ω = 47 kΩ.'],
      },
      {
        heading: 'The letter R is a decimal point',
        body: 'Small values need a decimal point, and a printed dot would be lost at that size. '
          + 'An R is used instead, standing where the dot would go.',
        example: ['4R7 means 4.7 Ω.', 'R47 means 0.47 Ω.'],
      },
      {
        heading: 'EIA-96 codes',
        body: 'Precision parts use a code that is not readable directly: two digits point at a '
          + 'position in a standard list of 96 values, and the letter gives the decade. You have '
          + 'to look it up — which is exactly what this tool is for.',
        example: ['68D: code 68 means 4.99, and D means ×1000, so 4.99 kΩ.'],
      },
      r.ok ? {
        heading: 'Your marking, worked through',
        example: [`"${r.code}" read as a ${r.type === 'eia96' ? 'EIA-96' : `${r.type === 'd4' ? '4' : '3'}-digit`} `
          + `marking means ${formatOhms(r.ohms)}.`],
      } : null,
    ].filter(Boolean),
  };
}

function ledExplainer(state) {
  const s = solveLedState(state);
  const pack = packFor(state);
  const runtime = runtimeFor(state);
  const vs = supplyVoltage(state);

  const blocks = [
    {
      heading: 'An LED cannot look after itself',
      body: 'A light bulb limits its own current, but an LED does not. Connect one straight '
        + 'across a battery and it will pull as much current as the battery can give, get hot, '
        + 'and burn out — often in less than a second. It needs something in series to hold the '
        + 'current down. That something is usually a resistor.',
    },
    {
      heading: 'Forward voltage: the part the LED keeps',
      body: 'Every LED needs a certain voltage across it before it conducts at all, and once it '
        + 'does, it holds roughly that voltage no matter what. That figure is the forward '
        + 'voltage. Red LEDs sit near 2 V; blue and white ones near 3.2 V. Whatever is left over '
        + 'from your supply has to be absorbed by the resistor.',
    },
    {
      heading: "Ohm's law is the whole calculation",
      body: 'Ohm\'s law says voltage across a resistor equals the current through it multiplied '
        + 'by its resistance. Rearranged to find the resistance you need:',
      formula: 'R = (supply voltage − LED forward voltage) ÷ current',
    },
  ];

  if (s.ok) {
    const b = s.branches[0];
    blocks.push({
      heading: 'Your circuit, worked through',
      example: [
        `The supply gives ${formatVolts(vs)}.`,
        s.topology === 'series' && s.ledCount > 1
          ? `${s.ledCount} LEDs in series each keep their own forward voltage, and those add up `
            + `to ${formatVolts(s.ledVoltage)}.`
          : `The LED keeps ${formatVolts(b.vf)}.`,
        `That leaves ${formatVolts(vs)} − ${formatVolts(s.ledVoltage)} = `
          + `${formatVolts(s.headroomV)} for the resistor.`,
        `You want ${formatAmps(Number(state.led.ifMa) / 1000)} through it, so `
          + `${formatVolts(s.headroomV)} ÷ ${formatAmps(Number(state.led.ifMa) / 1000)} = `
          + `${formatOhms(s.branches[0].idealR)}.`,
        `The nearest resistor you can actually buy is ${formatOhms(b.chosenR)}, which gives `
          + `${formatAmps(b.actualIfA, 3)} instead. Close enough.`,
      ],
    });
  }

  blocks.push({
    heading: 'Series and parallel are not the same',
    body: 'LEDs in series sit in one line, so the same current flows through all of them and '
      + 'their forward voltages add up. One resistor does for the lot. LEDs in parallel each sit '
      + 'across the full supply, so each one needs its own resistor — share one between them and '
      + 'whichever LED happens to have the lowest forward voltage steals most of the current and '
      + 'the others stay dim.',
  });

  blocks.push({
    heading: 'Power: why resistors get hot',
    body: 'A resistor turns the voltage it absorbs into heat. Too much and it scorches, so parts '
      + 'are sold with a power rating. The usual advice is to fit one rated two to ten times what '
      + 'you calculate.',
    formula: 'power = voltage across the resistor × current through it',
    example: s.ok ? [
      `${formatVolts(s.headroomV)} × ${formatAmps(s.branches[0].actualIfA, 3)} = `
        + `${formatWatts(s.powerR, 3)}`
        + (s.recommendedRatingW ? `, so fit at least a ${formatWatts(s.recommendedRatingW)} part.` : '.'),
    ] : null,
  });

  if (pack) {
    const line = [
      `The pack holds ${pack.capacityMah} mAh at ${formatVolts(pack.nominalV)}, which is `
        + `${Number(pack.energyWh.toPrecision(3))} Wh of energy.`,
    ];
    if (pack.regulated) {
      line.push(
        `This is a regulated ${formatVolts(pack.outputV)} output, so it holds its voltage steady `
        + 'and the current never drops — but the converter wastes some energy, so only '
        + `${Math.round(pack.efficiency * 100)}% of that (${Number(pack.usableWh.toPrecision(3))} Wh) `
        + 'reaches your circuit.',
      );
      if (runtime?.ok) {
        line.push(`Your circuit uses ${formatWatts(pack.outputV * runtime.cellCurrentA * pack.efficiency, 3)}, `
          + `so it runs for about ${formatDuration(runtime.shortestHours)}.`);
      }
    } else if (runtime?.ok) {
      line.push(
        'This output follows the cells, so as the battery drains its voltage falls, the current '
        + 'falls with it, and the LED slowly dims. That is why the answer is a range rather than '
        + 'a single number.',
        `Somewhere between ${formatDuration(runtime.shortestHours)} and `
          + `${formatDuration(runtime.longestHours)}.`,
      );
    }
    blocks.push({
      heading: 'How long a battery lasts',
      body: 'A battery is rated in milliamp-hours (mAh): roughly, how many milliamps it can give '
        + 'for how many hours. Divide the capacity by the current and you get hours.',
      formula: 'hours ≈ capacity (mAh) ÷ current (mA)',
      example: line,
    });
  }

  blocks.push({
    heading: 'Why use a tool instead of guessing',
    body: 'People guess "about 220 ohms" and mostly get away with it. But guess low and the LED '
      + 'runs hot and dies early; guess high and it is too dim to see. Working it out takes ten '
      + 'seconds and tells you the power rating and the battery life as well.',
  });

  return {
    title: 'How LED resistors work',
    intro: 'An LED is a component that turns electricity into light. It is efficient and lasts '
      + 'for years, but it will destroy itself if you connect it carelessly. This tool works out '
      + 'the resistor that protects it.',
    blocks,
  };
}

function combineExplainer(state) {
  const r = combineResult(state);
  const { kind, mode, components } = state.combine;
  const unit = unitFor(kind);
  const values = components.map((c) => formatEng(c.value, unit));

  return {
    title: 'How series and parallel combinations work',
    intro: 'Components are only made in certain values — you can buy a 10 kΩ resistor and a '
      + '12 kΩ one, but not an 11.3 kΩ one. When you need a value nobody sells, you make it by '
      + 'joining two together. This tool works out what a combination gives, and searches for the '
      + 'pair that lands closest to a value you want.',
    blocks: [
      {
        heading: 'Series means one after another',
        body: 'Components in series sit end to end in a single line, so the same current passes '
          + 'through all of them. For resistors the values simply add up.',
        formula: 'R total = R1 + R2 + R3 …',
      },
      {
        heading: 'Parallel means side by side',
        body: 'Components in parallel sit across the same two points, so current splits between '
          + 'them. The result is always smaller than the smallest one, because you have given the '
          + 'current extra routes to take.',
        formula: 'R total = 1 ÷ (1/R1 + 1/R2 + 1/R3 …)',
      },
      {
        heading: 'Capacitors do the opposite',
        body: 'A capacitor stores charge rather than resisting current, and the two laws swap '
          + 'over: capacitors add up in parallel and combine reciprocally in series. Inductors '
          + 'behave like resistors — adding in series — as long as they are far enough apart not '
          + 'to affect each other magnetically.',
      },
      r.ok ? {
        heading: 'Your network, worked through',
        example: [
          `${values.length} ${kind}${values.length === 1 ? '' : 's'} in ${mode}: `
            + values.join(mode === 'series' ? ' + ' : ' ∥ '),
          r.law === 'additive'
            ? `They add: ${values.join(' + ')} = ${formatEng(r.value, unit)}.`
            : `They combine reciprocally: 1 ÷ (${values.map((v) => `1/${v}`).join(' + ')}) `
              + `= ${formatEng(r.value, unit)}.`,
          `Allowing for tolerance, the real total sits between ${formatEng(r.min, unit)} and `
            + `${formatEng(r.max, unit)}.`,
        ],
      } : null,
      {
        heading: 'Preferred values, and why odd numbers are missing',
        body: 'Manufacturers make values spaced so that consecutive ones differ by about the '
          + 'tolerance — there is no point making 100 Ω and 101 Ω parts if both could really be '
          + '105 Ω. Those standard sets are called the E-series. E24 is what most hobby stock '
          + 'comes from; E96 is for precision work. That is why the tool keeps telling you the '
          + 'nearest standard value.',
      },
    ].filter(Boolean),
  };
}

const EXPLAINERS = {
  colour: colourExplainer,
  smd: smdExplainer,
  led: ledExplainer,
  combine: combineExplainer,
};

/* ------------------------------------------------------------ rendering */

function block(spec) {
  return el('section', { class: 'explain__block' }, [
    spec.heading ? el('h4', { class: 'explain__heading', text: spec.heading }) : null,
    spec.body ? el('p', { class: 'explain__body', text: spec.body }) : null,
    spec.formula ? el('p', { class: 'explain__formula', text: spec.formula }) : null,
    spec.example?.length ? el('ul', { class: 'explain__example' },
      spec.example.filter(Boolean).map((linePart) => el('li', { text: linePart }))) : null,
  ].filter(Boolean));
}

/**
 * Build the collapsible explainer for the active tool.
 * @param {HTMLElement} container
 */
export function renderExplainer(container, state) {
  clear(container);
  const build = EXPLAINERS[state.tool];
  if (!build) return;

  let spec;
  try {
    spec = build(state);
  } catch {
    // An explainer must never take the calculator down with it.
    return;
  }

  const open = state.openSections.explain ?? false;

  const body = el('div', { class: 'explain__body-wrap' }, [
    el('p', { class: 'explain__intro', text: spec.intro }),
    ...spec.blocks.map(block),
    el('p', {
      class: 'explain__footnote',
      text: 'Everything above is worked out in your browser from the values on this page. '
        + 'Change anything and the examples change with it.',
    }),
  ]);

  const panel = el('div', { class: 'explain', dataset: { open: String(open) } }, [
    el('button', {
      class: 'explain__toggle',
      type: 'button',
      'aria-expanded': String(open),
      on: {
        click: (e) => {
          const next = panel.dataset.open !== 'true';
          panel.dataset.open = String(next);
          e.currentTarget.setAttribute('aria-expanded', String(next));
          setState({ openSections: { explain: next } }, { silent: true });
        },
      },
    }, [
      el('span', { class: 'explain__chevron', 'aria-hidden': 'true', text: '›' }),
      el('span', { class: 'explain__title', text: spec.title }),
      el('span', { class: 'explain__hint', text: 'the formulas, in plain language' }),
    ]),
    body,
  ]);

  container.appendChild(panel);
}

export { EXPLAINERS };
export const explainerFor = (tool) => EXPLAINERS[tool] || null;
export const currentExplainer = () => explainerFor(getState().tool);
