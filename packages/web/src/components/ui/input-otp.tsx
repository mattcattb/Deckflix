import * as React from "react";
import {OTPInput, OTPInputContext} from "input-otp";
import {cn} from "../../lib/cn";

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({className, containerClassName, ...props}, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      "flex items-center gap-2 has-[:disabled]:opacity-50",
      containerClassName,
    )}
    className={cn("disabled:cursor-not-allowed", className)}
    {...props}
  />
));
InputOTP.displayName = "InputOTP";

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({className, ...props}, ref) => (
  <div ref={ref} className={cn("flex items-center", className)} {...props} />
));
InputOTPGroup.displayName = "InputOTPGroup";

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & {index: number}
>(({index, className, ...props}, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext);
  const {char, hasFakeCaret, isActive} = inputOTPContext.slots[index];

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-12 w-11 items-center justify-center border-y border-r border-white/[0.08] text-xl font-semibold transition-all first:rounded-l-md first:border-l last:rounded-r-md",
        "bg-white/[0.04]",
        isActive && "z-10 ring-2 ring-ring/55",
        className,
      )}
      {...props}>
      {char}
      {hasFakeCaret ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      ) : null}
    </div>
  );
});
InputOTPSlot.displayName = "InputOTPSlot";

export {InputOTP, InputOTPGroup, InputOTPSlot};
