import { useState, useEffect } from "react";

const DRAFT_KEY = "nosso_pacto_contrato_draft";

interface ContratoEditorState {
  showEditor: boolean;
  editingContratoId: string | null;
  regras: string[];
  direitos: string[];
  consequencias: string[];
  limiteResgate: string;
  resgateImediato: boolean;
  usarRecompensas: boolean;
  usarMesada: boolean;
  valorMesada: string;
  descricaoAlteracoes: string;
  novaRegra: string;
  novoDireito: string;
  novaConsequencia: string;
}

const defaultState: ContratoEditorState = {
  showEditor: false,
  editingContratoId: null,
  regras: [],
  direitos: [],
  consequencias: [],
  limiteResgate: "50",
  resgateImediato: true,
  usarRecompensas: true,
  usarMesada: false,
  valorMesada: "",
  descricaoAlteracoes: "",
  novaRegra: "",
  novoDireito: "",
  novaConsequencia: "",
};

function saveDraft(state: ContratoEditorState) {
  if (!state.showEditor) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {}
}

function loadDraft(): ContratoEditorState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ContratoEditorState;
  } catch {
    return null;
  }
}

function clearDraftStorage() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {}
}

export function useContratoEditor() {
  const [state, setState] = useState<ContratoEditorState>(() => {
    const draft = loadDraft();
    return draft ?? defaultState;
  });

  useEffect(() => {
    saveDraft(state);
  }, [state]);

  function set<K extends keyof ContratoEditorState>(key: K, value: ContratoEditorState[K]) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function openEditor(params: Partial<ContratoEditorState> & { showEditor: true }) {
    setState({ ...defaultState, ...params });
  }

  function closeEditor() {
    clearDraftStorage();
    setState(defaultState);
  }

  function clearDraft() {
    clearDraftStorage();
    setState(defaultState);
  }

  function hasDraft(): boolean {
    return !!loadDraft()?.showEditor;
  }

  return { ...state, set, openEditor, closeEditor, clearDraft, hasDraft };
}
