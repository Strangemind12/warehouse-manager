import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string };
export function SearchableProductSelect({
  products, value, onChange, onCreateNew, placeholder = "Select reagent / machine…", disabled,
}: {
  products: Product[];
  value: string | null;
  onChange: (id: string) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" })),
    [products],
  );
  const selected = products.find(p => p.id === value);
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
          <CommandInput placeholder="Type to search by name…" />
          <CommandList>
            <CommandEmpty>No reagent or machine found.</CommandEmpty>
            {onCreateNew && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => { setOpen(false); onCreateNew(); }}
                  className="text-primary font-medium cursor-pointer"
                >
                  <Plus className="mr-2 h-4 w-4" /> Create new reagent / machine…
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="All items (A–Z)">
              {sorted.map(p => (
                <CommandItem
                  key={p.id} value={p.name}
                  onSelect={() => { onChange(p.id); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
