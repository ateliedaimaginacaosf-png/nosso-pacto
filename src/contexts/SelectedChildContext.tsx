import React, { createContext, useContext, useState } from "react";

interface SelectedChildContextType {
  selectedChildId: string;
  setSelectedChildId: (id: string) => void;
}

const SelectedChildContext = createContext<SelectedChildContextType>({
  selectedChildId: "todos",
  setSelectedChildId: () => {},
});

export function SelectedChildProvider({ children }: { children: React.ReactNode }) {
  const [selectedChildId, setSelectedChildId] = useState<string>("todos");

  return (
    <SelectedChildContext.Provider value={{ selectedChildId, setSelectedChildId }}>
      {children}
    </SelectedChildContext.Provider>
  );
}

export function useSelectedChild() {
  return useContext(SelectedChildContext);
}
