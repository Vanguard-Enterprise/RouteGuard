"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react"

export type ComboboxOption = {
  label: string
  value: string
}

type ComboboxMultiSelectProps = {
  options: ComboboxOption[]
  value: string[]
  onValueChange: (value: string[]) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
}

export function ComboboxMultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select options",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  className,
}: ComboboxMultiSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [])

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return options
    }
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [options, query])

  const selectedLabels = useMemo(
    () => options.filter((option) => value.includes(option.value)).map((option) => option.label),
    [options, value]
  )

  function toggleOption(nextValue: string) {
    onValueChange(
      value.includes(nextValue)
        ? value.filter((current) => current !== nextValue)
        : [...value, nextValue]
    )
  }

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between gap-2"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate text-left">
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length === 1
              ? selectedLabels[0]
              : `${selectedLabels.length} schools selected`}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-lg border bg-popover p-2 shadow-md">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>

          <div className="mt-2 max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredOptions.map((option) => {
                  const checked = value.includes(option.value)

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="flex items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => toggleOption(option.value)}
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <span className="flex-1 truncate">{option.label}</span>
                      {checked ? <CheckIcon className="size-4 text-muted-foreground" /> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
