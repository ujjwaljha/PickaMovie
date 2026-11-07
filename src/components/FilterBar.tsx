import { useRef } from "react";
import { COMPANY_OPTIONS, ENERGY_OPTIONS, TIME_OPTIONS } from "../domain/copy";
import type { Filters } from "../domain/types";

export function FilterBar({
  filters,
  legend,
  onChange,
}: {
  filters: Filters;
  legend: string;
  onChange: (filters: Filters) => void;
}) {
  return (
    <fieldset className="filters">
      <legend>{legend}</legend>
      <ChoiceGroup
        label="Time available"
        value={filters.time}
        options={TIME_OPTIONS}
        onChange={(time) => onChange({ ...filters, time })}
      />
      <ChoiceGroup
        label="Energy level"
        value={filters.energy}
        options={ENERGY_OPTIONS}
        onChange={(energy) => onChange({ ...filters, energy })}
      />
      <ChoiceGroup
        label="Company"
        value={filters.company}
        options={COMPANY_OPTIONS}
        onChange={(company) => onChange({ ...filters, company })}
      />
    </fieldset>
  );
}

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; hint: string }[];
  onChange: (id: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="choice-block">
      <p id={`${slug}-label`} className="choice-label">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`${slug}-label`} className="choice-grid">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => {
              const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!delta) return;
              event.preventDefault();
              const next = (index + delta + options.length) % options.length;
              const optionNext = options[next];
              if (!optionNext) return;
              onChange(optionNext.id);
              refs.current[next]?.focus();
            }}
          >
            <span>{option.label}</span>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
