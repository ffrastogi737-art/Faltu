import type { CaptionStyle, Cue } from "../services/api";

/** Draws the caption line for time `t` (seconds from clip start) the way the export will, scaled to its container.
 *  The parent must set `container-type: inline-size`; sizes are in cqw so they track the preview width. */
export default function CaptionOverlay({ cues, style, t }: { cues: Cue[]; style: CaptionStyle; t: number }) {
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return null;
  const u = (px: number) => `${(px / 1080) * 100}cqw`;
  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center px-[6cqw]" style={{ top: `${style.pos_y * 100}%`, transform: "translateY(-50%)" }}>
      <div className="text-center leading-tight" style={{
        fontFamily: `"${style.font}", Inter, sans-serif`, fontSize: u(style.size), fontWeight: style.bold ? 800 : 500, color: style.primary,
        ...(style.box ? { background: `${style.outline_color}99`, padding: `${u(style.outline)} ${u(style.outline * 2)}`, borderRadius: u(6) }
          : { WebkitTextStroke: `${u(style.outline * 2)} ${style.outline_color}`, paintOrder: "stroke fill", textShadow: style.shadow ? `${u(style.shadow)} ${u(style.shadow)} 0 ${style.outline_color}` : undefined }),
      }}>
        {cue.words.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return <span key={i} className="inline-block transition-transform duration-75" style={{ margin: `0 ${u(style.size * 0.12)}`, color: active ? style.highlight : undefined, transform: active ? `scale(${style.active_scale / 100})` : undefined }}>{w.text}</span>;
        })}
      </div>
    </div>
  );
}
