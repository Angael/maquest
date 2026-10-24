import clsx, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const cn = (...c: ClassValue[]) => twMerge(clsx(c))
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Button({ className, variant = 'ghost', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'danger' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors disabled:opacity-40',
        variant === 'primary' && 'bg-amber-500 font-medium text-stone-950 hover:bg-amber-400',
        variant === 'ghost' && 'text-stone-300 hover:bg-stone-800 hover:text-stone-100',
        variant === 'danger' && 'text-red-400 hover:bg-red-500/10',
        className,
      )}
    />
  )
}

const field = 'w-full rounded-md border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-sm text-stone-100 placeholder:text-stone-600 outline-none focus:border-amber-500/60'

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(field, className)} />
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cn(field, className)} />
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cn(field, className)} />

export const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 text-[11px] font-medium tracking-wider text-stone-500 uppercase">{children}</div>
)
