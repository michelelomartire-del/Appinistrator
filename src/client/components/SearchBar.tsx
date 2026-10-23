import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { SearchResults } from '@shared/api-types';
import { segnalazioneStatoLabels } from '@shared/constants';
import { formatDate } from '@shared/format';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 320);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<SearchResults>(`/ricerca?q=${encodeURIComponent(debounced)}`)
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setOpen(true);
        }
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    setResults(null);
    navigate(path);
  };

  const groups = results
    ? [
        {
          label: 'Condomini',
          items: results.condomini.map((c) => ({
            key: c.id,
            label: `${c.denominazione} · ${c.codice}`,
            hint: c.comune ?? '',
            onClick: () => go(`/condomini/${c.id}`),
          })),
        },
        {
          label: 'Persone',
          items: results.persone.map((p) => ({
            key: p.id,
            label: `${p.cognome} ${p.nome}`,
            hint: p.email ?? '',
            onClick: () => go(`/persone/${p.id}`),
          })),
        },
        {
          label: 'Segnalazioni',
          items: results.segnalazioni.map((s) => ({
            key: s.id,
            label: `${s.codice} · ${s.titolo}`,
            hint: s.condominio,
            onClick: () => go(`/segnalazioni/${s.id}`),
          })),
        },
        {
          label: 'Assemblee',
          items: results.assemblee.map((a) => ({
            key: a.id,
            label: `${a.condominio} · ${formatDate(a.data) ?? ''}`,
            hint: a.tipo,
            onClick: () => go(`/assemblee/${a.id}`),
          })),
        },
        {
          label: 'Rendiconti',
          items: results.periodi.map((p) => ({
            key: p.id,
            label: p.etichetta,
            hint: p.condominio,
            onClick: () => go(`/rendiconti/periodi/${p.id}`),
          })),
        },
        {
          label: 'Consumi',
          items: results.consumi.map((c) => ({
            key: c.id,
            label: `${c.condominio} · ${formatDate(c.periodoDa) ?? ''}`,
            hint: c.categoria,
            onClick: () => go(`/consumi?condominioId=${c.condominioId ?? ''}`),
          })),
        },
        {
          label: 'Documenti',
          items: results.documenti.map((d) => ({
            key: d.id,
            label: d.nomeFile,
            hint: d.condominio ?? '',
            onClick: () => {
              setOpen(false);
              window.location.href = `/api/documenti/${d.id}/download`;
            },
          })),
        },
      ].filter((group) => group.items.length > 0)
    : [];

  return (
    <div className="search" ref={containerRef}>
      <span className="search__icon" aria-hidden="true">
        🔍
      </span>
      <input
        className="search__input"
        type="search"
        placeholder="Cerca condominio, persona, segnalazione…"
        aria-label="Ricerca globale"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => results && setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && debounced.length >= 2 ? (
        <div className="search__results" role="listbox" aria-label="Risultati ricerca">
          {loading ? <div className="search__empty">Ricerca in corso…</div> : null}
          {!loading && groups.length === 0 ? (
            <div className="search__empty">Nessun risultato per “{debounced}”.</div>
          ) : null}
          {groups.map((group) => (
            <div key={group.label}>
              <div className="search__group-title">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="search__result"
                  onClick={item.onClick}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <div>{item.label}</div>
                  {item.hint ? <div className="muted small">{item.hint}</div> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {results
          ? `${groups.reduce((acc, g) => acc + g.items.length, 0)} risultati trovati`
          : loading
            ? 'Ricerca in corso'
            : ''}
      </span>
      <span className="sr-only">{Object.keys(segnalazioneStatoLabels).length}</span>
    </div>
  );
}
