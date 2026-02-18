import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Tables } from "@/integrations/supabase/types";

type Config = Tables<"configuracao_familia">;

export default function ConfiguracaoFamilia() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [selectedChildId, setSelectedChildId] = useState("");
  const [limiteResgate, setLimiteResgate] = useState("50");

  const { data: membros } = useQuery({
    queryKey: ["membros-familia", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, nome, tipo_perfil")
        .eq("familia_id", profile!.familia_id);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const criancas = membros?.filter(m => m.tipo_perfil === "crianca") ?? [];

  useEffect(() => {
    if (criancas.length > 0 && !selectedChildId) {
      setSelectedChildId(criancas[0].user_id);
    }
  }, [criancas, selectedChildId]);

  const { data: config, isLoading } = useQuery({
    queryKey: ["config-familia", profile?.familia_id, selectedChildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_familia")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("crianca_id", selectedChildId)
        .maybeSingle();
      if (error) throw error;
      return data as Config | null;
    },
    enabled: !!profile && !!selectedChildId,
  });

  useEffect(() => {
    if (config) {
      setLimiteResgate(String(config.limite_resgate_diario));
    }
  }, [config]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("configuracao_familia")
        .update({
          limite_resgate_diario: parseInt(limiteResgate) || 50,
        })
        .eq("familia_id", profile!.familia_id)
        .eq("crianca_id", selectedChildId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-familia"] });
      toast({ title: "Configurações salvas! ⚙️" });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

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
          <p className="text-muted-foreground">Ajustes gerais por filho(a)</p>
        </motion.div>

        {criancas.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium whitespace-nowrap">Filho(a):</Label>
            <Select value={selectedChildId} onValueChange={setSelectedChildId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {criancas.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">{c.nome.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {c.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-4 max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-2">
              <CardHeader><CardTitle className="font-display text-lg">Geral</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Limite de resgate diário (moedas)</Label>
                  <Input type="number" min="1" value={limiteResgate} onChange={e => setLimiteResgate(e.target.value)} className="mt-1" />
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 Regras de Ouro e Consequências são gerenciadas no <strong>Contrato de Autonomia</strong>.
                </p>
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
