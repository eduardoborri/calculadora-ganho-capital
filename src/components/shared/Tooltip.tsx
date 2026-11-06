import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

interface TooltipProps {
  text?: string;
}

const WIDTH = 256;
const GAP = 8;
const MARGIN = 8;

// Help bubble that opens on hover, keyboard focus and tap (focus), so it works
// without a mouse; the text is also exposed to screen readers via aria-label.
// It is rendered in a portal with fixed positioning, so table containers with
// overflow can't clip it; it opens below the icon when there's no room above.
export default function Tooltip({ text }: TooltipProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; below: boolean } | null>(null);
  const open = hovered || focused;

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const button = buttonRef.current?.getBoundingClientRect();
      const height = bubbleRef.current?.offsetHeight ?? 0;
      if (!button) return;
      const center = button.left + button.width / 2;
      const left = Math.min(Math.max(center - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN);
      const below = button.top - GAP - height < MARGIN;
      const top = below ? button.bottom + GAP : button.top - GAP - height;
      setPos({ top, left, arrow: center - left, below });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  if (!text) return null;
  return (
    <span className="relative inline-block ml-2">
      <button
        ref={buttonRef}
        type="button"
        aria-label={text}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="align-middle text-gray-500 hover:text-secondary focus:text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary rounded-full cursor-help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, width: WIDTH, visibility: pos ? "visible" : "hidden" }}
            className="block p-3 bg-primary text-white text-xs font-normal rounded-lg z-[100] leading-relaxed pointer-events-none shadow-lg"
          >
            {text}
            <span
              style={{ left: pos?.arrow ?? WIDTH / 2 }}
              className={`absolute -translate-x-1/2 border-8 border-transparent ${
                pos?.below ? "bottom-full border-b-primary" : "top-full border-t-primary"
              }`}
            ></span>
          </span>,
          document.body
        )}
    </span>
  );
}
