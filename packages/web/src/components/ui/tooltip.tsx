import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/cn";

type TooltipProps = Omit<TooltipPrimitive.TooltipProps, "children"> & {
  content: React.ComponentProps<typeof TooltipPrimitive.Content>["children"];
  children: React.ComponentProps<typeof TooltipPrimitive.Trigger>["children"];
  align?: React.ComponentProps<typeof TooltipPrimitive.Content>["align"];
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
};

export function Tooltip({
  content,
  children,
  align = "center",
  side = "top",
  ...props
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root {...props}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            align={align}
            side={side}
            className={cn(
              "z-50 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-foreground shadow-lg"
            )}
          >
            <TooltipPrimitive.Arrow className="fill-surface-elevated" />
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
