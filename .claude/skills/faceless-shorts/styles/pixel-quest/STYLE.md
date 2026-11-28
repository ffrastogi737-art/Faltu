# pixel-quest: retro 8-bit arcade look (Press Start 2P, square sticker cards, stepped sky bands, pixel clouds, brick ground), 9:16

Scaffolded from comic-pop by port_style.sh. Fill in: look rules, shot kinds, kit, QA pitfalls (same sections as comic-pop/STYLE.md).

## Look (ported 28 Nov 2026 from comic-pop's auto-vertical engine; same `vis` kinds I Q S C, same script format)
- Font: Press Start 2P (OFL, in example/fonts). Everything is square: cards, chips, stamps (the `rr` radius is forced to 0). Chips shrink to fit 980 px.
- Background: flat colour bands + checker overlay + drifting pixel clouds + grass/brick ground strip; a new colour pair per shot (BG).
- Use for gaming / retro-feeling topics (GTA, patches, mechanics). Example: GTA 6 gas stops (shorts-out/gta6-channel/32).
- QA: the head text on Q cards is dark-grey on white (readable); long chips auto-shrink, check `sheet` for clipping.
