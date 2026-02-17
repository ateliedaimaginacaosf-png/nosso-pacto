import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, CheckCircle2, XCircle, Loader2, AlertTriangle, Unlock, Lock, Coins } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useRegrasOuroStatus } from "@/hooks/useRegrasOuroStatus";
import { useSelectedChild } from "@/contexts/SelectedChildContext";
import { getAvatarUrl } from "@/lib/avatar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

export default function RegrasOuroFilhos() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { selectedChildId, setSelectedChildId } = useSelectedChild();
  const [liberarDialogOpen, setLiberarDialogOpen] = useState(false);
  const [tipoLiberacao, setTipoLiberacao] = useState<"total" | "limite_moedas">("total");
  const [limiteMoedas, setLimiteMoedas] = useState("");

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Get children
  const { data: filhos } = useQuery({
    queryKey: ["filhos", profile?.familia_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("familia_id", profile!.familia_id)
        .eq("tipo_perfil", "crianca");
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile,
  });

  const currentChild = filhos?.find((f) => f.user_id === selectedChildId) ?? filhos?.[0];
  const childId = currentChild?.user_id;

  // Get child's actual balance via RPC
  const { data: saldoCrianca } = useQuery({
    queryKey: ["saldo-crianca", childId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("calcular_saldo", { _user_id: childId! });
      if (error) throw error;
      return data as number;
    },
    enabled: !!childId,
  });

  const saldo = saldoCrianca ?? currentChild?.saldo_moedas ?? 0;

  const {
    bloqueado,
    bloqueadoOriginal,
    liberacao,
    limiteLiberdade,
    regrasOuro,
    hasRules,
    checkinsOntem,
    diasDescumpridos,
  } = useRegrasOuroStatus(childId, profile?.familia_id);

  // Today's checkins for the child
  const { data: checkinsHoje, isLoading } = useQuery({
    queryKey: ["regra-ouro-checkin", childId, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regra_ouro_checkin")
        .select("*")
        .eq("crianca_id", childId!)
        .eq("familia_id", profile!.familia_id)
        .eq("data", todayStr);
      if (error) throw error;
      return data;
    },
    enabled: !!childId && !!profile,
  });

  const checkinHojeMap = new Map((checkinsHoje ?? []).map((c) => [c.regra, c]));
  const checkinOntemMap = new Map((checkinsOntem ?? []).map((c) => [c.regra, c.cumprida]));

  // Auto-fill limiteMoedas when opening dialog or switching type
  useEffect(() => {
    if (tipoLiberacao === "total") {
      setLimiteMoedas(String(saldo));
    } else {
      setLimiteMoedas("");
    }
  }, [tipoLiberacao, saldo]);

  const liberarMutation = useMutation({
    mutationFn: async () => {
      if (!childId || !profile) throw new Error("Sem dados");

      const limiteNum = tipoLiberacao === "limite_moedas" ? parseInt(limiteMoedas) : null;

      // Validate limit against balance
      if (tipoLiberacao === "limite_moedas" && limiteNum != null && limiteNum > saldo) {
        throw new Error(`Limite (${limiteNum}) excede o saldo atual (${saldo}).`);
      }

      const { data: existing } = await supabase
        .from("regra_ouro_liberacao")
        .select("id")
        .eq("crianca_id", childId)
        .eq("familia_id", profile.familia_id)
        .eq("data", todayStr)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("regra_ouro_liberacao")
          .update({
            tipo: tipoLiberacao,
            limite_moedas: limiteNum,
            liberado_por: profile.user_id,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regra_ouro_liberacao").insert({
          crianca_id: childId,
          familia_id: profile.familia_id,
          data: todayStr,
          liberado_por: profile.user_id,
          tipo: tipoLiberacao,
          limite_moedas: limiteNum,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regra-ouro-liberacao"] });
      toast({ title: "Liberação registrada! ✅" });
      setLiberarDialogOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message || "Não foi possível liberar.", variant: "destructive" });
    },
  });

  // Mutation for parent to toggle a child's checkin
  const toggleCheckinMutation = useMutation({
    mutationFn: async ({ regra, cumprida, data }: { regra: string; cumprida: boolean; data: string }) => {
      if (!childId || !profile) throw new Error("Sem dados");

      const { data: existing } = await supabase
        .from("regra_ouro_checkin")
        .select("id")
        .eq("crianca_id", childId)
        .eq("familia_id", profile.familia_id)
        .eq("data", data)
        .eq("regra", regra)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("regra_ouro_checkin")
          .update({ cumprida })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regra_ouro_checkin").insert({
          crianca_id: childId,
          familia_id: profile.familia_id,
          data,
          regra,
          cumprida,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["regra-ouro-checkin", childId, variables.data] });
      if (variables.data === yesterdayStr) {
        queryClient.invalidateQueries({ queryKey: ["regra-ouro-descumprimentos"] });
      }
    },
    onError: () => {
      toast({ title: "Erro ao atualizar regra", variant: "destructive" });
    },
  });

  const limiteInvalido = tipoLiberacao === "limite_moedas" && limiteMoedas && parseInt(limiteMoedas) > saldo;

  return (
    <AppLayout>
      <div className="space-y-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Regras de Ouro ⭐</h1>
          <p className="text-muted-foreground">Acompanhe o cumprimento dos combinados</p>
        </motion.div>

        {/* Child selector */}
        {filhos && filhos.length > 1 && (
          <Select value={childId ?? ""} onValueChange={setSelectedChildId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Selecione o filho" />
            </SelectTrigger>
            <SelectContent>
              {filhos.map((f) => (
                <SelectItem key={f.user_id} value={f.user_id}>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={getAvatarUrl(f.foto_url) ?? undefined} />
                      <AvatarFallback className="text-[10px]">👧</AvatarFallback>
                    </Avatar>
                    {f.nome}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!hasRules ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-display text-lg font-semibold">Nenhuma regra de ouro definida</p>
              <p className="text-sm text-muted-foreground">
                Defina as regras no Contrato de Autonomia.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Alert with stats */}
            {diasDescumpridos > 0 && (
              <Card className="border-2 border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="flex items-center gap-3 py-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                  <p className="text-sm">
                    <strong>{currentChild?.nome}</strong> deixou de cumprir regras em{" "}
                    <strong>{diasDescumpridos} dia{diasDescumpridos > 1 ? "s" : ""}</strong> nos últimos 30 dias.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Block status + liberation button */}
            {bloqueadoOriginal && (
              <Card className={`border-2 ${bloqueado ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5"}`}>
                <CardContent className="flex items-center justify-between gap-3 py-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    {bloqueado ? (
                      <Lock className="h-5 w-5 text-destructive" />
                    ) : (
                      <Unlock className="h-5 w-5 text-primary" />
                    )}
                    <div>
                      <p className="font-semibold text-sm">
                        {bloqueado
                          ? "Resgates bloqueados hoje"
                          : liberacao?.tipo === "total"
                          ? "Liberação total concedida"
                          : `Liberação parcial: até ${limiteLiberdade} moedas`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {currentChild?.nome} não cumpriu todas as regras ontem.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={bloqueado ? "default" : "outline"}
                    onClick={() => {
                      setTipoLiberacao("total");
                      setLiberarDialogOpen(true);
                    }}
                  >
                    <Unlock className="h-4 w-4 mr-1" />
                    {bloqueado ? "Liberar" : "Alterar"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Yesterday's rules - editable by parent */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ontem ({format(subDays(new Date(), 1), "dd/MM", { locale: ptBR })})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {regrasOuro.map((regra) => {
                  const cumprida = checkinOntemMap.get(regra);
                  return (
                    <div key={regra} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="flex items-center gap-3">
                        {cumprida ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                        <span className="text-sm">{regra}</span>
                      </div>
                      <Switch
                        checked={cumprida ?? false}
                        onCheckedChange={(checked) =>
                          toggleCheckinMutation.mutate({ regra, cumprida: checked, data: yesterdayStr })
                        }
                        disabled={toggleCheckinMutation.isPending}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Today's rules - editable by parent */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hoje ({format(new Date(), "dd/MM", { locale: ptBR })})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {regrasOuro.map((regra) => {
                  const checkin = checkinHojeMap.get(regra);
                  const cumprida = checkin?.cumprida;
                  return (
                    <div key={regra} className="flex items-center justify-between gap-3 py-1.5">
                      <div className="flex items-center gap-3">
                        {cumprida ? (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        ) : cumprida === false ? (
                          <XCircle className="h-4 w-4 text-destructive shrink-0" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                        )}
                        <span className="text-sm">{regra}</span>
                      </div>
                      <Switch
                        checked={cumprida ?? false}
                        onCheckedChange={(checked) =>
                          toggleCheckinMutation.mutate({ regra, cumprida: checked, data: todayStr })
                        }
                        disabled={toggleCheckinMutation.isPending}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        )}

        {/* Liberation dialog */}
        <Dialog open={liberarDialogOpen} onOpenChange={setLiberarDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Liberar resgates para {currentChild?.nome}</DialogTitle>
              <DialogDescription>
                Flexibilize o bloqueio de resgates causado pelo descumprimento das regras de ouro.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Child balance info */}
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <Coins className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium">Saldo atual de {currentChild?.nome}</p>
                  <p className="text-lg font-bold">{saldo} moedas</p>
                </div>
              </div>

              <div>
                <Label>Tipo de liberação</Label>
                <Select value={tipoLiberacao} onValueChange={(v) => setTipoLiberacao(v as "total" | "limite_moedas")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total">Liberação total (até {saldo} moedas)</SelectItem>
                    <SelectItem value="limite_moedas">Limitar por moedas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tipoLiberacao === "limite_moedas" && (
                <div>
                  <Label>Limite de moedas para hoje</Label>
                  <Input
                    type="number"
                    min={1}
                    max={saldo}
                    placeholder={`Máx: ${saldo}`}
                    value={limiteMoedas}
                    onChange={(e) => setLimiteMoedas(e.target.value)}
                  />
                  {limiteInvalido && (
                    <p className="text-xs text-destructive mt-1">
                      O limite não pode ser maior que o saldo atual ({saldo} moedas).
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLiberarDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => liberarMutation.mutate()}
                disabled={
                  liberarMutation.isPending ||
                  (tipoLiberacao === "limite_moedas" && (!limiteMoedas || !!limiteInvalido))
                }
              >
                {liberarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
