import * as React from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "../../lib/cn";

type TooltipProps = Omit<BaseTooltip.Root.Props, "children"> & {
  content: React.ComponentProps<typeof BaseTooltip.Popup>["children"];
  children: React.ComponentProps<typeof BaseTooltip.Trigger>["children"];
  align?: BaseTooltip.Positioner.Props["align"];
  side?: BaseTooltip.Positioner.Props["side"];
};

export function Tooltip({
  content,
  children,
  align = "center",
  side = "top",
  ...props
}: TooltipProps) {
  return (
    <BaseTooltip.Provider>
      <BaseTooltip.Root {...props}>
        <BaseTooltip.Trigger>{children}</BaseTooltip.Trigger>
        <BaseTooltip.Portal>
          <BaseTooltip.Positioner
            align={align}
            side={side}
            className="z-50"
          >
            <BaseTooltip.Popup
              className={cn(
                "rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-foreground shadow-lg"
              )}
            >
              <BaseTooltip.Arrow className="fill-surface-elevated" />
              {content}
            </BaseTooltip.Popup>
          </BaseTooltip.Positioner>
        </BaseTooltip.Portal>
      </BaseTooltip.Root>
    </BaseTooltip.Provider>
  );
}
