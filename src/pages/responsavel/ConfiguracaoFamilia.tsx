import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Loader2, Save, Plus, X, RotateCcw, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import type { Tables } from "@/integrations/supabase/types";

type Config = Tables<"configuracao_familia">;

export default function ConfiguracaoFamilia() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [limiteResgate, setLimiteResgate] = useState("50");
  const [regras, setRegras] = useState<string[]>([]);
  const [regrasInativas, setRegrasInativas] = useState<string[]>([]);
  const [consequencias, setConsequencias] = useState<string[]>([]);
  const [novaRegra, setNovaRegra] = useState("");
  const [novaConsequencia, setNovaConsequencia] = useState("");

  const { data: config, isLoading } = useQuery({
    queryKey: ["config-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .single();
      if (error) throw error;
      return data as Config;
    },
    enabled: !!profile,
  });

  useEffect(() => {
    if (config) {
      setLimiteResgate(String(config.limite_resgate_diario));
      setRegras(config.regras_ouro ?? []);
      setRegrasInativas((config as any).regras_ouro_inativas ?? []);
      setConsequencias(config.consequencias_naturais ?? []);
    }
  }, [config]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracao_familia")
        .update({
          limite_resgate_diario: parseInt(limiteResgate) || 50,
          regras_ouro: regras,
          regras_ouro_inativas: regrasInativas,
          consequencias_naturais: consequencias,
        } as any)
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-familia"] });
      toast({ title: "Configurações salvas! ⚙️" });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  const addRegra = () => {
    if (novaRegra.trim()) {
      setRegras([...regras, novaRegra.trim()]);
      setNovaRegra("");
    }
  };

  const addConsequencia = () => {
    if (novaConsequencia.trim()) {
      setConsequencias([...consequencias, novaConsequencia.trim()]);
      setNovaConsequencia("");
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Configurações ⚙️</h1>
          <p className="text-muted-foreground">Contrato de Autonomia da família</p>
        </motion.div>

        <div className="space-y-4 max-w-2xl">
          {/* General settings */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-2">
              <CardHeader><CardTitle className="font-display text-lg">Geral</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Limite de resgate diário (moedas)</Label>
                  <Input type="number" min="1" value={limiteResgate} onChange={e => setLimiteResgate(e.target.value)} className="mt-1" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Regras de Ouro */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-2">
              <CardHeader><CardTitle className="font-display text-lg">🏆 Regras de Ouro</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {regras.map((regra, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2">
                    <span className="flex-1 text-sm">{regra}</span>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setRegras(regras.filter((_, idx) => idx !== i));
                      setRegrasInativas([...regrasInativas, regra]);
                    }} title="Desativar regra">
                      <EyeOff className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {regrasInativas.length > 0 && (
                  <>
                    <p className="text-xs text-muted-foreground mt-2 font-medium">Desativadas</p>
                    {regrasInativas.map((regra, i) => (
                      <div key={`inativa-${i}`} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2 opacity-60">
                        <span className="flex-1 text-sm line-through">{regra}</span>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setRegrasInativas(regrasInativas.filter((_, idx) => idx !== i));
                          setRegras([...regras, regra]);
                        }} title="Reativar regra">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}
                <div className="flex gap-2">
                  <Input placeholder="Nova regra..." value={novaRegra} onChange={e => setNovaRegra(e.target.value)} onKeyDown={e => e.key === "Enter" && addRegra()} />
                  <Button size="sm" variant="outline" onClick={addRegra}><Plus className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Consequências Naturais */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-2">
              <CardHeader><CardTitle className="font-display text-lg">⚡ Consequências Naturais</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {consequencias.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted p-2">
                    <span className="flex-1 text-sm">{c}</span>
                    <Button size="sm" variant="ghost" onClick={() => setConsequencias(consequencias.filter((_, idx) => idx !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input placeholder="Nova consequência..." value={novaConsequencia} onChange={e => setNovaConsequencia(e.target.value)} onKeyDown={e => e.key === "Enter" && addConsequencia()} />
                  <Button size="sm" variant="outline" onClick={addConsequencia}><Plus className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="w-full">
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Salvar Configurações</>}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
