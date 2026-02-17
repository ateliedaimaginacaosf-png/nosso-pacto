import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, XCircle, Loader2, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";

export default function RegrasOuro() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { regrasOuro, hasRules, bloqueado, limiteLiberdade, liberacao, bloqueadoOriginal } =
    useRegrasOuroStatus(profile?.user_id, profile?.familia_id);

  // Today's checkins
  const { data: checkinsHoje, isLoading } = useQuery({
    queryKey: ["regra-ouro-checkin", profile?.user_id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("*")
        .eq("crianca_id", profile!.user_id)
        .eq("familia_id", profile!.familia_id)
        .eq("data", todayStr);
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const checkinMap = new Map(
    (checkinsHoje ?? []).map((c) => [c.regra, c])
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ regra, cumprida }: { regra: string; cumprida: boolean }) => {
      const existing = checkinMap.get(regra);
      if (existing) {
        const { error } = await supabase
          .from("regra_ouro_checkin")
          .update({ cumprida })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regra_ouro_checkin").insert({
          crianca_id: profile!.user_id,
          familia_id: profile!.familia_id,
          data: todayStr,
          regra,
          cumprida,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regra-ouro-checkin"] });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível atualizar.", variant: "destructive" });
    },
  });

  const allChecked = regrasOuro.every((r) => checkinMap.get(r)?.cumprida === true);
  const checkedCount = regrasOuro.filter((r) => checkinMap.get(r)?.cumprida === true).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Regras de Ouro ⭐</h1>
          <p className="text-muted-foreground">
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </motion.div>

        {/* Block warning */}
        {bloqueadoOriginal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className={`border-2 ${bloqueado ? "border-destructive/40 bg-destructive/5" : "border-yellow-500/40 bg-yellow-500/5"}`}>
              <CardContent className="flex items-start gap-3 py-4">
                <Lock className={`h-5 w-5 mt-0.5 ${bloqueado ? "text-destructive" : "text-yellow-600"}`} />
                <div>
                  {bloqueado ? (
                    <>
                      <p className="font-semibold text-destructive">Resgates bloqueados hoje</p>
                      <p className="text-sm text-muted-foreground">
                        Você não cumpriu todas as regras de ouro ontem. Peça ao seu responsável para liberar.
                      </p>
                    </>
                  ) : liberacao?.tipo === "total" ? (
                    <>
                      <p className="font-semibold text-yellow-700">Resgates liberados pelo responsável</p>
                      <p className="text-sm text-muted-foreground">
                        Mesmo com regras pendentes ontem, seu responsável liberou os resgates hoje.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-yellow-700">Resgates parcialmente liberados</p>
                      <p className="text-sm text-muted-foreground">
                        Seu responsável liberou até <strong>{limiteLiberdade} moedas</strong> para resgates hoje.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Today's rules */}
        {!hasRules ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma regra de ouro definida</p>
              <p className="text-sm text-muted-foreground">
                As regras de ouro são definidas no Contrato de Autonomia.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Badge variant={allChecked ? "default" : "secondary"} className="gap-1">
                {allChecked ? <CheckCircle2 className="h-3 w-3" /> : null}
                {checkedCount}/{regrasOuro.length} cumpridas hoje
              </Badge>
            </div>

            <div className="space-y-3">
              {regrasOuro.map((regra, i) => {
                const checkin = checkinMap.get(regra);
                const cumprida = checkin?.cumprida === true;

                return (
                  <motion.div
                    key={regra}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className={`border-2 transition-colors ${cumprida ? "border-primary/30 bg-primary/5" : "border-muted"}`}>
                      <CardContent className="flex items-center gap-4 py-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
                          {cumprida ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <XCircle className="h-5 w-5 text-muted-foreground/50" />
                          )}
                        </div>
                        <p className={`flex-1 font-medium text-sm ${cumprida ? "text-foreground" : "text-muted-foreground"}`}>
                          {regra}
                        </p>
                        <Switch
                          checked={cumprida}
                          onCheckedChange={(checked) =>
                            toggleMutation.mutate({ regra, cumprida: checked })
                          }
                          disabled={toggleMutation.isPending}
                        />
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
