import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  forwardRef,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

export const cn = (...c: ClassValue[]) => twMerge(clsx(c))

/*
 * Primitives. Sizes: sm = 24px (dense toolbars, rows), md = 28px (default), lg = 32px (forms, start screen).
 * Every icon-only control needs a label: IconButton takes it and shows it as a tooltip with the shortcut.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'subtle' | 'primary' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40'
const buttonVariant = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent',
  ghost: 'text-fg-muted hover:bg-hover hover:text-fg active:bg-active',
  subtle: 'bg-surface text-fg shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-raised active:bg-raised',
  outline: 'text-fg-muted shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-hover hover:text-fg',
  danger: 'text-danger hover:bg-danger-soft',
}
const buttonSize = { sm: 'h-6 px-2 text-xs', md: 'h-7 px-2.5 text-sm', lg: 'h-8 px-3 text-sm' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant = 'ghost', size = 'md', type = 'button', ...p }, ref) {
  return <button ref={ref} type={type} {...p} className={cn(buttonBase, buttonVariant[variant], buttonSize[size], className)} />
})

type IconButtonProps = Omit<ButtonProps, 'children'> & {
  icon: LucideIcon
  /** Accessible name, also shown as the tooltip. */
  label: string
  shortcut?: string
  /** Pressed/active state (toggles). */
  active?: boolean
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  children?: ReactNode
}

const iconSize = { sm: 'size-6', md: 'size-7', lg: 'size-8' }

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, shortcut, active, size = 'md', variant = 'ghost', tooltipSide = 'bottom', className, children, ...p },
  ref,
) {
  const button = (
    <Button
      ref={ref}
      aria-label={label}
      aria-pressed={active}
      variant={variant}
      size={size}
      className={cn(iconSize[size], 'px-0', active && 'bg-active text-fg', className)}
      {...p}
    >
      <Icon size={size === 'sm' ? 14 : 16} aria-hidden />
      {children}
    </Button>
  )
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  )
})

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-white/8 px-1 font-sans text-[10px] font-medium text-fg-subtle',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** Shortcut text like "Ctrl+K" rendered as key caps. */
export function Shortcut({ keys, className }: { keys: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.split('+').map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  )
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <BaseTooltip.Provider delay={500} closeDelay={0}>
      {children}
    </BaseTooltip.Provider>
  )
}

export function Tooltip({
  content,
  shortcut,
  side = 'bottom',
  children,
}: {
  content: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-[70]">
          <BaseTooltip.Popup className="tooltip-motion flex items-center gap-2 rounded-md bg-raised px-2 py-1 text-xs text-fg shadow-[var(--shadow-popover)]">
            {content}
            {shortcut && <Shortcut keys={shortcut} />}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

/* Menus: anchored, light-dismiss, keyboard navigable. */

export const popupSurface = 'rounded-lg bg-raised p-1 text-sm text-fg shadow-[var(--shadow-popover)] outline-none'
export const menuItem =
  'flex h-7 w-full cursor-default items-center gap-2 rounded-[5px] px-2 text-left text-sm text-fg-muted outline-none select-none data-[highlighted]:bg-hover data-[highlighted]:text-fg data-[disabled]:opacity-40'

export function Menu({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  className,
}: {
  trigger: ReactElement
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger ref={triggerRef} render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner side={side} align={align} sideOffset={6} className="z-[60]">
          <BaseMenu.Popup
            // An item may replace the trigger or open a field that takes focus (e.g. rename); then leave focus where it went.
            finalFocus={() => !!triggerRef.current?.isConnected && !document.activeElement?.matches('input, textarea, [contenteditable="true"]')}
            className={cn(popupSurface, 'popup-motion min-w-48', className)}
          >
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

/** Leading 14px slot shared by icons, swatches and check marks, so labels line up. */
function MenuIcon({ icon: Icon, iconNode, color, danger }: { icon?: LucideIcon; iconNode?: ReactNode; color?: string; danger?: boolean }) {
  if (iconNode) return <span className="flex size-3.5 shrink-0 items-center justify-center">{iconNode}</span>
  if (!Icon) return null
  return <Icon size={14} aria-hidden className={cn('shrink-0', !color && !danger && 'text-fg-subtle')} style={color ? { color } : undefined} />
}

const MenuShortcut = ({ keys }: { keys?: string }) => (keys ? <span className="shrink-0 pl-3 text-2xs text-fg-faint">{keys}</span> : null)

type ItemLook = {
  icon?: LucideIcon
  /** Custom leading visual (status dot, color swatch) in the icon slot. */
  iconNode?: ReactNode
  /** Icon color (node types). */
  color?: string
  shortcut?: string
  disabled?: boolean
}

export function MenuItem({
  icon,
  iconNode,
  color,
  children,
  shortcut,
  danger,
  onClick,
  disabled,
}: ItemLook & {
  children: ReactNode
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <BaseMenu.Item
      className={cn(menuItem, danger && 'text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger')}
      onClick={onClick}
      disabled={disabled}
    >
      <MenuIcon icon={icon} iconNode={iconNode} color={color} danger={danger} />
      <span className="flex-1 truncate">{children}</span>
      <MenuShortcut keys={shortcut} />
    </BaseMenu.Item>
  )
}

/** A nested menu that opens beside its row (hover, click or the right arrow key). */
export function MenuSub({ label, children, className, ...look }: ItemLook & { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <BaseMenu.SubmenuRoot>
      <BaseMenu.SubmenuTrigger className={cn(menuItem, 'data-[popup-open]:bg-hover data-[popup-open]:text-fg')} disabled={look.disabled}>
        <MenuIcon {...look} />
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight size={14} aria-hidden className="-mr-0.5 shrink-0 text-fg-faint" />
      </BaseMenu.SubmenuTrigger>
      <BaseMenu.Portal>
        <BaseMenu.Positioner alignOffset={-4} sideOffset={2} collisionPadding={6} className="z-[60]">
          <BaseMenu.Popup className={cn(popupSurface, 'context-motion max-h-[var(--available-height)] min-w-44 overflow-y-auto', className)}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.SubmenuRoot>
  )
}

const Tick = () => <Check size={14} aria-hidden className="text-accent-text" />

/** On/off item with a check mark in the icon slot. Closes the menu like a native one. */
export function MenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
  shortcut,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
  shortcut?: string
  disabled?: boolean
}) {
  return (
    <BaseMenu.CheckboxItem className={menuItem} checked={checked} onCheckedChange={(on) => onCheckedChange(on)} disabled={disabled} closeOnClick>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <BaseMenu.CheckboxItemIndicator>
          <Tick />
        </BaseMenu.CheckboxItemIndicator>
      </span>
      <span className="flex-1 truncate">{children}</span>
      <MenuShortcut keys={shortcut} />
    </BaseMenu.CheckboxItem>
  )
}

export function MenuRadioGroup({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) {
  return (
    <BaseMenu.RadioGroup value={value} onValueChange={(v) => onValueChange(v as string)}>
      {children}
    </BaseMenu.RadioGroup>
  )
}

/** One choice of a `MenuRadioGroup`. With its own icon the check mark sits at the end, otherwise in the icon slot. */
export function MenuRadioItem({ value, children, ...look }: ItemLook & { value: string; children: ReactNode }) {
  const own = !!(look.icon || look.iconNode)
  return (
    <BaseMenu.RadioItem value={value} closeOnClick disabled={look.disabled} className={menuItem}>
      {own ? (
        <MenuIcon {...look} />
      ) : (
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <BaseMenu.RadioItemIndicator>
            <Tick />
          </BaseMenu.RadioItemIndicator>
        </span>
      )}
      <span className="flex-1 truncate">{children}</span>
      {own && (
        <BaseMenu.RadioItemIndicator>
          <Tick />
        </BaseMenu.RadioItemIndicator>
      )}
      <MenuShortcut keys={look.shortcut} />
    </BaseMenu.RadioItem>
  )
}

export const MenuSeparator = () => <BaseMenu.Separator className="mx-1 my-1 h-px bg-line" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="px-2 pt-1.5 pb-1 text-2xs font-medium text-fg-subtle">{children}</div>

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'end',
  className,
  open,
  onOpenChange,
  hover,
}: {
  trigger: ReactElement
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Also open on hover after a delay (a click keeps it open). */
  hover?: boolean
}) {
  return (
    <BasePopover.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <BasePopover.Trigger render={trigger} openOnHover={hover} delay={hover ? 350 : undefined} closeDelay={hover ? 120 : undefined} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={6} className="z-[60]">
          <BasePopover.Popup className={cn(popupSurface, 'popup-motion p-0', className)}>{children}</BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

/* Fields. */

const field =
  'w-full rounded-md bg-surface px-2.5 text-sm text-fg shadow-[inset_0_0_0_1px_var(--color-line)] outline-none transition-shadow duration-100 placeholder:text-fg-faint hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)] focus:shadow-[inset_0_0_0_1px_var(--color-accent)] disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cn(field, 'h-7', className)} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} {...p} className={cn(field, 'resize-none py-1.5 leading-5 [field-sizing:content]', className)} />
})
/** Native select (keeps keyboard/OS behaviour) with a custom chevron. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} {...p} className={cn(field, 'h-7 appearance-none truncate pr-7 [&>option]:bg-raised')} />
      <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  )
})

export const Label = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mb-1.5 text-xs font-medium text-fg-subtle', className)}>{children}</div>
)

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: LucideIcon; showLabel?: boolean }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex shrink-0 rounded-md bg-app/60 p-0.5 shadow-[inset_0_0_0_1px_var(--color-line)]', className)}>
      {options.map(({ value: option, label: name, icon: Icon, showLabel }) => {
        const on = value === option
        const inner = (
          <button
            key={String(option)}
            type="button"
            aria-label={name}
            aria-pressed={on}
            onClick={() => onChange(option)}
            className={cn(
              'flex h-6 min-w-8 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium whitespace-nowrap outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-accent/70',
              on ? 'bg-raised text-fg shadow-[0_1px_2px_oklch(0_0_0/0.4),inset_0_0_0_1px_var(--color-line)]' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {Icon && <Icon size={14} aria-hidden className={on ? 'text-accent-text' : undefined} />}
            {(showLabel || !Icon) && name}
          </button>
        )
        return Icon && !showLabel ? (
          <Tooltip key={String(option)} content={name}>
            {inner}
          </Tooltip>
        ) : (
          inner
        )
      })}
    </div>
  )
}

export const Separator = ({ vertical, className }: { vertical?: boolean; className?: string }) => (
  <div
    role="separator"
    aria-orientation={vertical ? 'vertical' : 'horizontal'}
    className={cn(vertical ? 'mx-1 h-4 w-px' : 'my-1 h-px w-full', 'shrink-0 bg-line', className)}
  />
)

/** Floating toolbars and panels over the canvas. */
export const floating = 'rounded-lg bg-panel/95 shadow-[var(--shadow-float)] backdrop-blur-sm'
