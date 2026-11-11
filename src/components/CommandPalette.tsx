import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRetail } from '../state/useRetail';
import { commandResults, type CommandResult } from '../lib/commandSearch';
import { EmptyState, Modal } from './ui';
import './command-palette.css';

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { data } = useRetail();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = commandResults(data, query);
  const listId = useId();
  const list = useRef<HTMLUListElement>(null);
  const selected = Math.min(activeIndex, Math.max(0, results.length - 1));
  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected, query]);
  function open(result: CommandResult) {
    onClose();
    navigate(result.to);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => results.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0);
    } else if (event.key === 'Enter' && results[selected]) {
      event.preventDefault();
      open(results[selected]);
    }
  }
  return (
    <Modal title="Buscar en el negocio" onClose={onClose} wide>
      <div className="sl-command-search">
        <Search size={21} />
        <input
          autoFocus
          type="search"
          role="combobox"
          aria-label="Buscar productos, contactos, documentos y secciones"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[selected] ? `${listId}-${selected}` : undefined}
          placeholder="Producto, SKU, cliente, documento o acción…"
          maxLength={160}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p className="sl-command-hint">↑ ↓ para elegir · Enter para abrir · Esc para cerrar</p>
      <ul ref={list} className="sl-command-results" id={listId} role="listbox" aria-label="Resultados de búsqueda">
        {results.map((result, index) => (
          <li key={result.id} id={`${listId}-${index}`} role="option" aria-selected={index === selected}>
            <button type="button" onClick={() => open(result)} onFocus={() => setActiveIndex(index)}>
              <span><strong>{result.label}</strong><small>{result.detail}</small></span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {!results.length && <EmptyState title="No encontramos coincidencias" description="Prueba con el nombre, SKU, teléfono o número de documento." />}
    </Modal>
  );
}
