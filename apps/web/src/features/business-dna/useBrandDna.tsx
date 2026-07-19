import { useCallback, useEffect, useState } from 'react';
import { listClientBrandDna, type ClientBusinessDnaRow } from './brandDna';

export const SELF_BRAND_ID = 'self';

function selectionStorageKey(orgId: string) {
  return 'time2grow.brandDna.selected.' + (orgId || 'local');
}

function readStoredSelection(orgId: string): string {
  if (typeof window === 'undefined') return SELF_BRAND_ID;
  try {
    return window.localStorage.getItem(selectionStorageKey(orgId)) || SELF_BRAND_ID;
  } catch {
    return SELF_BRAND_ID;
  }
}

// Loads the client Business DNA list (agency mode only) and tracks which brand
// DNA is selected - the org's own ("self") or a client - persisting the choice
// per org so it is stable across navigation. Reusable across pages.
export function useBrandDna(orgId: string | undefined, isAgency: boolean) {
  const [clients, setClients] = useState<ClientBusinessDnaRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [selectedId, setSelectedIdState] = useState<string>(SELF_BRAND_ID);
  const [error, setError] = useState('');

  const reloadClients = useCallback(async () => {
    if (!orgId || !isAgency) {
      setClients([]);
      return;
    }
    setLoadingClients(true);
    try {
      setClients(await listClientBrandDna(orgId));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load client brands.');
    } finally {
      setLoadingClients(false);
    }
  }, [orgId, isAgency]);

  useEffect(() => {
    setSelectedIdState(orgId ? readStoredSelection(orgId) : SELF_BRAND_ID);
  }, [orgId]);

  useEffect(() => {
    reloadClients();
  }, [reloadClients]);

  const setSelectedId = useCallback(
    (id: string) => {
      setSelectedIdState(id);
      if (orgId && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(selectionStorageKey(orgId), id);
        } catch {
          // ignore storage failures
        }
      }
    },
    [orgId],
  );

  // A selected client that no longer exists (deleted) falls back to self.
  const selectedClient = clients.find((client) => client.id === selectedId) ?? null;
  const effectiveId = selectedId !== SELF_BRAND_ID && !selectedClient ? SELF_BRAND_ID : selectedId;

  return {
    clients,
    loadingClients,
    error,
    reloadClients,
    selectedId: effectiveId,
    selectedClient,
    setSelectedId,
  };
}

type BrandDnaSelectProps = {
  selfLabel: string;
  label?: string;
  clients: ClientBusinessDnaRow[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
};

// Dropdown to pick which brand DNA to use: the org's own or a client. Render
// this only in agency mode; single-workspace callers just use the self DNA.
export function BrandDnaSelect({ selfLabel, label = 'Brand', clients, value, onChange, disabled }: BrandDnaSelectProps) {
  return (
    <label className="poster-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value={SELF_BRAND_ID}>{selfLabel}</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}
