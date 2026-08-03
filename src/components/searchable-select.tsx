import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

/** Generic type-to-search dropdown used for brands, product types, etc. */
export function SearchableSelect({
  options, value, onChange, placeholder = "Select…", searchPlaceholder = "Type to search…",
  emptyText = "Nothing found.", createLabel, onCreateNew, disabled, heading = "All (A–Z)",
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  createLabel?: string;
  onCreateNew?: () => void;
  disabled?: boolean;
  heading?: string;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" })),
    [options],
  );
  const selected = options.find(o => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground")}
        >
          <span className="truncate">{selected?.name ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {onCreateNew && createLabel && (
              <CommandGroup>
                <CommandItem onSelect={() => { setOpen(false); onCreateNew(); }} className="text-primary font-medium cursor-pointer">
                  <Plus className="mr-2 h-4 w-4" /> {createLabel}
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={heading}>
              {sorted.map(o => (
                <CommandItem key={o.id} value={o.name} onSelect={() => { onChange(o.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
