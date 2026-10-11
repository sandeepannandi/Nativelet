# Nativelet

Interface experiments today. A reusable React Native collection next.

Nativelet is the next direction for Design-Experiments: components and screens that developers can preview, inspect, and bring into their own React Native apps.

> **Current status:** this repository contains a Next.js web showcase with one implemented component, Preview Rail. The React Native / Expo library and its native screens are planned, not available yet.

## What's here

- **Preview Rail:** an animated navigation rail with vertical and horizontal layouts, hover and keyboard-focus previews, controlled or internal selection, and reduced-motion handling.
- **Web showcase:** an animated phone design study, an interactive Preview Rail playground, and a code view with component and helper source plus a copy button.
- **Native roadmap:** React Native components and blocks are planned. The phone is a web design study, not a shipped native screen.

The current component uses React DOM, Framer Motion, Tailwind classes, and local helpers. It cannot be pasted unchanged into a React Native app. The code view also needs those helpers and theme styles; it is not a standalone install bundle.

## Run the current showcase

```bash
git clone https://github.com/sandeepannandi/Nativelet.git
cd Nativelet
npm ci
npm run dev
```

Open the local address printed by Next.js.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Serve a completed production build |
| `npm run lint` | Run the configured Next.js lint command |

The current app uses Next.js 14, React 18, TypeScript, Framer Motion, Tailwind CSS, and Geist. See `package.json` for the dependency ranges and `package-lock.json` for the locked versions.

## Read the source

```text
app/
  components/preview-rail.tsx   Component implementation
  components/nativelet-site.tsx Website interactions
  page.tsx                      Loads component and helper source
  layout.tsx                    Page metadata and Geist font
  globals.css                   Global styles and theme tokens
  page.module.css               Website styles
lib/
  ease.ts                       Animation settings
  hooks/use-hover-capable.ts    Hover capability detection
  utils.ts                      Class-name helper
```

## Planned native direction

The intended rebuild is a React Native / Expo project with a website that previews the same native components through React Native Web.

The plan includes:

- Reusable components and screens with clear props and usage examples.
- Per-component source, required files, dependencies, and setup instructions.
- Copy and download flows checked in a separate React Native app.
- Native and web checks, keyboard support where relevant, and reduced-motion behavior.

This is a roadmap, not a release announcement. There is no published native package or supported native installation command in this repository today.

## Contributing

Small, focused changes are easiest to review. For changes to the planned native architecture, open an issue first so the approach can be agreed before implementation. For a component change, include what changed, how to run it, and screenshots or a recording of the interaction.

Keep documentation clear about what is implemented and what is planned. Do not add installation or compatibility claims that have not been checked.

## License

MIT. See [LICENSE](LICENSE) for the terms. Keep the copyright and license notice when reusing the code.
