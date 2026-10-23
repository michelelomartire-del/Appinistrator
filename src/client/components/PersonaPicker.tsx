import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { TextInput } from "./ui";
import type { Paginated, PersonaDto } from "@shared/api-types";

/** Ricerca di una persona esistente: evita di creare doppioni in anagrafica. */
export function PersonaPicker({
  selected,
  onSelect,
  placeholder = "Cerca per nome, cognome o codice fiscale…",
}: {
  selected: { id: string; label: string } | null;
  onSelect: (persona: { id: string; label: string } | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 280);
    return () => clearTimeout(timer);
  }, [q]);

  const { data, isFetching } = useQuery<Paginated<PersonaDto & { condominiCount?: number }>>({
    queryKey: ["persone", "picker", debounced],
    queryFn: () => api(`/persone?perPage=8&q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
    staleTime: 20_000,
  });

  if (selected) {
    return (
      <div className="row row--between" style={{ border: "1px solid var(--c-border)", borderRadius: 6, padding: "0.45rem 0.6rem" }}>
        <span>{selected.label}</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onSelect(null)}>
          Cambia
        </button>
      </div>
    );
  }

  return (
    <div>
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {isFetching ? <p className="muted small">Ricerca…</p> : null}
      {data && debounced.length >= 2 && data.items.length === 0 ? (
        <p className="muted small">Nessuna persona trovata. Puoi crearne una nuova con i campi sotto.</p>
      ) : null}
      {data && data.items.length > 0 ? (
        <ul className="stack stack--sm" style={{ listStyle: "none", padding: "0.4rem 0", margin: 0 }}>
          {data.items.map((persona) => (
            <li key={persona.id}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                style={{ width: "100%", justifyContent: "space-between" }}
                onClick={() =>
                  onSelect({ id: persona.id, label: `${persona.cognome} ${persona.nome}${persona.email ? ` · ${persona.email}` : ""}` })
                }
              >
                <span>
                  {persona.cognome} {persona.nome}
                </span>
                <span className="muted small">{persona.email ?? persona.telefono ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
