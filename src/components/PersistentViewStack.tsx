import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface PersistentViewDefinition {
  key: string;
  path?: string;
  element: ReactNode;
  persistent?: boolean;
}

interface PersistentViewStackProps {
  basePath: string;
  views: PersistentViewDefinition[];
}

const normalizePath = (value: string) => {
  if (!value || value === "/") return "/";
  return value.replace(/\/+$/, "") || "/";
};

export function PersistentViewStack({ basePath, views }: PersistentViewStackProps) {
  const location = useLocation();
  const pathname = useMemo(() => normalizePath(location.pathname), [location.pathname]);
  const normalizedBasePath = useMemo(() => normalizePath(basePath), [basePath]);

  const activeKey = useMemo(() => {
    const activeView = views.find((view) => {
      const viewPath = view.path ? normalizePath(`${normalizedBasePath}/${view.path}`) : normalizedBasePath;
      return viewPath === pathname;
    });

    return activeView?.key ?? views[0]?.key ?? "";
  }, [normalizedBasePath, pathname, views]);

  const [visitedKeys, setVisitedKeys] = useState<string[]>([]);

  useEffect(() => {
    const activeView = views.find((view) => view.key === activeKey);
    if (!activeView || activeView.persistent === false) return;

    setVisitedKeys((current) => (current.includes(activeKey) ? current : [...current, activeKey]));
  }, [activeKey, views]);

  return (
    <>
      {views.map((view) => {
        const isActive = view.key === activeKey;
        const shouldRender = isActive || (view.persistent !== false && visitedKeys.includes(view.key));

        if (!shouldRender) return null;

        return (
          <section key={view.key} hidden={!isActive} aria-hidden={!isActive} className={cn(!isActive && "hidden")}>
            {view.element}
          </section>
        );
      })}
    </>
  );
}
