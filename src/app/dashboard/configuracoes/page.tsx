"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "next-themes";
import {
  User,
  Settings,
  Sun,
  Moon,
  Sparkles,
  Loader2,
  Store,
  Printer,
  MessageCircle,
  QrCode,
  Link2Off,
  Bell,
  BellOff,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStoreInfo,
  saveStoreInfo,
  printReceipt,
  isAutoPrintReceiptEnabled,
  setAutoPrintReceipt,
  type StoreInfo,
} from "@/lib/receipt";
import {
  fetchEvolutionSettings,
  saveEvolutionConfig,
  connectWhatsapp,
  getConnectionState,
  disconnectWhatsapp,
  setWhatsappConnected,
  type EvolutionConfig,
  type MessageTemplates,
  DEFAULT_TEMPLATES,
  getTemplates,
  saveTemplates,
  applyTemplate,
} from "@/lib/whatsapp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  fetchVapidPublicKey,
} from "@/lib/push";

export default function ConfiguracoesPage() {
  const { profile, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();

  const [geminiKey, setGeminiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_vendas_gemini_key") || "";
    }
    return "";
  });
  const [geminiModel, setGeminiModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_vendas_gemini_model") || "gemini-2.5-flash";
    }
    return "gemini-2.5-flash";
  });
  const [showKey, setShowKey] = useState(false);

  const [openaiKey, setOpenaiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("app_vendas_openai_key") || "";
    }
    return "";
  });
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);

  // Dados da loja (para o cabeçalho do recibo)
  const [store, setStore] = useState<StoreInfo>(() => getStoreInfo());
  const [autoPrint, setAutoPrint] = useState(true);

  useEffect(() => {
    setAutoPrint(isAutoPrintReceiptEnabled());
  }, []);

  function handleToggleAutoPrint(value: boolean) {
    setAutoPrint(value);
    setAutoPrintReceipt(value);
    toast.success(
      value
        ? "Recibo automático ativado."
        : "Recibo automático desativado.",
      { description: "Você ainda pode imprimir manualmente após a venda." }
    );
  }

  function handleSaveAISettings() {
    localStorage.setItem("app_vendas_gemini_key", geminiKey.trim());
    localStorage.setItem("app_vendas_gemini_model", geminiModel);
    localStorage.setItem("app_vendas_openai_key", openaiKey.trim());
    toast.success("Configurações de IA salvas com sucesso!");
  }

  async function handleSaveStore() {
    if (!store.name.trim()) {
      toast.error("Informe o nome da loja.");
      return;
    }
    saveStoreInfo(store);
    // Persiste nome da loja e chave PIX no banco (usados nos lembretes do WhatsApp)
    await supabase
      .from("app_settings")
      .update({ store_name: store.name.trim(), pix_key: (store.pixKey || "").trim() })
      .eq("id", 1);
    toast.success("Dados da loja salvos!", {
      description: "Aparecerão no cabeçalho dos recibos.",
    });
  }

  function handlePreviewReceipt() {
    saveStoreInfo(store);
    printReceipt({
      store,
      saleNumber: 0,
      date: new Date().toISOString(),
      seller: profile?.full_name || "Vendedor",
      customer: "Cliente Exemplo",
      items: [
        { name: "Produto de Exemplo A", quantity: 2, unit: "un", unitPrice: 4.5, total: 9.0 },
        { name: "Produto de Exemplo B", quantity: 1, unit: "un", unitPrice: 25.9, total: 25.9 },
      ],
      subtotal: 34.9,
      discount: 0,
      total: 34.9,
      paymentMethodLabel: "Dinheiro",
      cashReceived: 50,
      change: 15.1,
    });
  }

  // ---- WhatsApp (Evolution API) — config persistida no banco ----
  const [evo, setEvo] = useState<EvolutionConfig>({
    baseUrl: "",
    apiKey: "",
    instance: "",
  });
  const [evoQr, setEvoQr] = useState<string | null>(null);
  const [evoConnecting, setEvoConnecting] = useState(false);
  const [evoChecking, setEvoChecking] = useState(false);
  const [evoConnected, setEvoConnected] = useState(false);
  const [waReminders, setWaReminders] = useState(true);

  // Carrega a preferência de lembrete automático ao cliente
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("wa_reminders_enabled, pix_key, store_name")
      .eq("id", 1)
      .single()
      .then(
        (res: {
          data: {
            wa_reminders_enabled: boolean;
            pix_key: string | null;
            store_name: string | null;
          } | null;
        }) => {
          if (!res.data) return;
          setWaReminders(!!res.data.wa_reminders_enabled);
          // Semeia PIX/nome do banco caso ainda não estejam salvos localmente
          setStore((prev) => {
            const next = { ...prev };
            if (!prev.pixKey && res.data!.pix_key) next.pixKey = res.data!.pix_key;
            if ((!prev.name || prev.name === "VendaFácil") && res.data!.store_name) {
              next.name = res.data!.store_name;
            }
            return next;
          });
        }
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Modelos de mensagem ----
  const [templates, setTemplates] = useState<MessageTemplates>(() => getTemplates());
  const [savingTpl, setSavingTpl] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("message_templates")
      .eq("id", 1)
      .single()
      .then((res: { data: { message_templates: Partial<MessageTemplates> | null } | null }) => {
        if (res.data?.message_templates) {
          const merged = { ...DEFAULT_TEMPLATES, ...res.data.message_templates };
          setTemplates(merged);
          saveTemplates(merged);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveTemplates() {
    setSavingTpl(true);
    saveTemplates(templates);
    const { error } = await supabase
      .from("app_settings")
      .update({ message_templates: templates })
      .eq("id", 1);
    setSavingTpl(false);
    if (error) {
      toast.error("Não foi possível salvar os modelos", { description: error.message });
    } else {
      toast.success("Modelos de mensagem salvos!");
    }
  }

  function handleResetTemplates() {
    setTemplates(DEFAULT_TEMPLATES);
    toast.info("Modelos restaurados para o padrão. Clique em Salvar para aplicar.");
  }

  function previewCollection(kind: "vespera" | "hoje" | "atraso"): string {
    const offset = kind === "atraso" ? -3 : kind === "hoje" ? 0 : 1;
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    // usa o texto em edição (localStorage já reflete só ao salvar; então montamos aqui)
    return applyTemplate(
      kind === "atraso"
        ? templates.lembrete_atraso
        : kind === "hoje"
        ? templates.lembrete_hoje
        : templates.lembrete_vespera,
      {
        primeiro_nome: "Maria",
        cliente: "Maria Silva",
        valor: "R$ 99,90",
        vencimento: new Date(iso + "T00:00:00").toLocaleDateString("pt-BR"),
        pix: store.pixKey || "(sua chave PIX)",
        loja: store.name || "Sua Loja",
      }
    );
  }

  function previewPayment(): string {
    return applyTemplate(templates.confirmacao_pagamento, {
      loja: store.name || "Sua Loja",
      primeiro_nome: "Maria",
      cliente: "Maria Silva",
      valor_pago: "R$ 50,00",
      parcela: "1",
      venda: "34",
      status_parcela: "Resta nesta parcela: R$ 49,90",
      saldo_linha: "Saldo total em aberto: *R$ 49,90*",
    });
  }

  function previewReceipt(): string {
    const pix = store.pixKey || "(sua chave PIX)";
    return applyTemplate(templates.comprovante_venda, {
      loja: (store.name || "Sua Loja").toUpperCase(),
      contato:
        (store.cnpj ? `CNPJ: ${store.cnpj}\n` : "") +
        (store.phone ? `Tel: ${store.phone}\n` : ""),
      numero: "34",
      data: new Date().toLocaleString("pt-BR"),
      cliente: "Maria Silva",
      cliente_linha: "👤 Maria Silva\n",
      itens:
        "• BLUSA MOLETOM URSO\n   1 un x R$ 99,90 = R$ 99,90",
      resumo:
        "Subtotal: R$ 99,90\n*TOTAL: R$ 99,90*\nPagamento: Crediário",
      parcelas:
        `\n*Parcelas (crediário):*\n   1ª · venc. 08/08/2026 · R$ 99,90\n\n💳 *Pague as parcelas via PIX:* ${pix}\nApós o pagamento, envie o comprovante por aqui.\n`,
      rodape: (store.footer || "Obrigado pela preferência! Volte sempre.") + "\n",
      pix,
    });
  }

  async function handleToggleWaReminders(value: boolean) {
    setWaReminders(value);
    await supabase
      .from("app_settings")
      .update({ wa_reminders_enabled: value })
      .eq("id", 1);
    toast.success(
      value
        ? "Lembrete automático ao cliente ativado."
        : "Lembrete automático ao cliente desativado."
    );
  }

  // Carrega a config salva no banco
  useEffect(() => {
    fetchEvolutionSettings(supabase)
      .then((s) => {
        setEvo({ baseUrl: s.baseUrl, apiKey: s.apiKey, instance: s.instance });
        setEvoConnected(s.connected);
      })
      .catch(() => {});
  }, [supabase]);

  // Enquanto o QR está na tela, verifica a conexão a cada 3s
  useEffect(() => {
    if (!evoQr || evoConnected) return;
    const id = setInterval(async () => {
      try {
        const state = await getConnectionState(evo);
        if (state === "open") {
          setEvoConnected(true);
          await setWhatsappConnected(supabase, true);
          setEvoQr(null);
          toast.success("WhatsApp conectado com sucesso!");
        }
      } catch {
        // ignora erros transitórios durante o polling
      }
    }, 3000);
    return () => clearInterval(id);
  }, [evoQr, evoConnected, evo, supabase]);

  async function handleConnectWhatsapp() {
    if (!evo.baseUrl.trim() || !evo.apiKey.trim() || !evo.instance.trim()) {
      toast.error("Preencha URL, API Key e nome da instância.");
      return;
    }
    setEvoConnecting(true);
    setEvoQr(null);
    try {
      await saveEvolutionConfig(supabase, evo);
      const qr = await connectWhatsapp(evo);
      // Pode já estar conectado (sem QR)
      const state = await getConnectionState(evo).catch(() => "close");
      if (state === "open") {
        setEvoConnected(true);
        await setWhatsappConnected(supabase, true);
        toast.success("WhatsApp já está conectado!");
      } else if (qr) {
        setEvoQr(qr);
        toast.info("Escaneie o QR Code com o WhatsApp do celular.");
      } else {
        toast.error("Não foi possível obter o QR Code. Verifique os dados.");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Falha ao conectar.";
      toast.error("Erro ao conectar WhatsApp", { description: msg });
    } finally {
      setEvoConnecting(false);
    }
  }

  async function handleCheckWhatsapp() {
    setEvoChecking(true);
    try {
      const state = await getConnectionState(evo);
      const connected = state === "open";
      setEvoConnected(connected);
      await setWhatsappConnected(supabase, connected);
      if (connected) {
        setEvoQr(null);
        toast.success("WhatsApp conectado.");
      } else {
        toast.warning(`Status: ${state}. Ainda não conectado.`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Falha ao verificar.";
      toast.error("Erro ao verificar status", { description: msg });
    } finally {
      setEvoChecking(false);
    }
  }

  async function handleDisconnectWhatsapp() {
    try {
      await disconnectWhatsapp(evo);
    } catch {
      // mesmo que falhe no servidor, limpamos o estado
    }
    setEvoConnected(false);
    await setWhatsappConnected(supabase, false);
    setEvoQr(null);
    toast.success("WhatsApp desconectado.");
  }

  // ---- Notificações push ----
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = isPushSupported();

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled).catch(() => {});
  }, []);

  async function handleEnablePush() {
    if (!user?.id) return;
    setPushBusy(true);
    try {
      const vapid = await fetchVapidPublicKey(supabase);
      await subscribeToPush(supabase, user.id, vapid);
      setPushEnabled(true);
      toast.success("Notificações ativadas neste aparelho!");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Falha ao ativar.";
      toast.error("Não foi possível ativar as notificações", { description: msg });
    } finally {
      setPushBusy(false);
    }
  }

  async function handleDisablePush() {
    setPushBusy(true);
    try {
      await unsubscribeFromPush(supabase);
      setPushEnabled(false);
      toast.success("Notificações desativadas neste aparelho.");
    } catch {
      toast.error("Falha ao desativar as notificações.");
    } finally {
      setPushBusy(false);
    }
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .substring(0, 2)
      .toUpperCase() || "??";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie suas preferências de usuário, perfil e dados de demonstração.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="h-16 w-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
              <AvatarFallback className="text-xl font-bold">{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-xl">{profile?.full_name}</CardTitle>
              <CardDescription>{user?.email}</CardDescription>
              <div className="flex gap-2 mt-1">
                <Badge variant={profile?.role === "admin" ? "default" : "secondary"} className="capitalize">
                  {profile?.role}
                </Badge>
                {profile?.is_active && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                    Ativo
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block">Telefone</span>
                <span className="font-medium">{profile?.phone || "Não informado"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Cadastrado em</span>
                <span className="font-medium">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "N/A"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Theme Preferences Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <Settings className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Preferências do App</CardTitle>
              <CardDescription>Configure a interface visual do sistema</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium block text-sm">Modo Escuro / Claro</span>
                <span className="text-muted-foreground text-xs">Alterna entre cores escuras e claras</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setTheme("light")}
                  className="h-9 w-9"
                >
                  <Sun className="h-4 w-4" />
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setTheme("dark")}
                  className="h-9 w-9"
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Configurations Card */}
        <Card className="border shadow-md">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Inteligência Artificial (IA)</CardTitle>
              <CardDescription>Configure as integrações com Google Gemini e OpenAI</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <label htmlFor="gemini-key" className="text-sm font-semibold block">Chave de API do Gemini</label>
              <div className="relative">
                <input
                  id="gemini-key"
                  type={showKey ? "text" : "password"}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Cole sua API Key do Gemini (AI Studio)"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                  {showKey ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Sua chave fica salva localmente no seu navegador e não é enviada para nenhum servidor externo além da API oficial do Google.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="gemini-model" className="text-sm font-semibold block">Modelo de IA</label>
              <Select value={geminiModel} onValueChange={setGeminiModel}>
                <SelectTrigger id="gemini-model" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash (Recomendado)</SelectItem>
                  <SelectItem value="gemini-1.5-flash">Gemini 1.5 Flash (Mais leve)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Usado para preencher nome e descrição do produto a partir da foto.
              </p>
            </div>

            <div className="space-y-2 border-t pt-4">
              <label htmlFor="openai-key" className="text-sm font-semibold block">Chave de API da OpenAI</label>
              <div className="relative">
                <input
                  id="openai-key"
                  type={showOpenaiKey ? "text" : "password"}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="Cole sua API Key da OpenAI (sk-...)"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs font-semibold"
                >
                  {showOpenaiKey ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Usada em &ldquo;Estilizar imagem&rdquo; para gerar a foto premium do produto (modelo gpt-image-1). Fica salva apenas no seu navegador.
              </p>
            </div>

            <Button
              onClick={handleSaveAISettings}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium shadow-sm"
            >
              Salvar Configurações de IA
            </Button>
          </CardContent>
        </Card>

        {/* Store / Receipt Card */}
        <Card className="border shadow-md md:col-span-2">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Dados da Loja (Recibo)</CardTitle>
              <CardDescription>
                Informações exibidas no cabeçalho e rodapé do cupom de venda
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-name">Nome da Loja *</Label>
                <Input
                  id="store-name"
                  value={store.name}
                  onChange={(e) => setStore({ ...store, name: e.target.value })}
                  placeholder="Minha Loja"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-cnpj">CNPJ / CPF</Label>
                <Input
                  id="store-cnpj"
                  value={store.cnpj || ""}
                  onChange={(e) => setStore({ ...store, cnpj: e.target.value })}
                  placeholder="00.000.000/0001-00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-phone">Telefone</Label>
                <Input
                  id="store-phone"
                  value={store.phone || ""}
                  onChange={(e) => setStore({ ...store, phone: e.target.value })}
                  placeholder="(11) 99999-8888"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-pix">Chave PIX (parcelas)</Label>
                <Input
                  id="store-pix"
                  value={store.pixKey || ""}
                  onChange={(e) => setStore({ ...store, pixKey: e.target.value })}
                  placeholder="(41) 99999-9999, CPF, e-mail..."
                />
                <p className="text-[10px] text-muted-foreground">
                  Aparece no recibo e nas cobranças de crediário enviadas ao cliente.
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-address">Endereço</Label>
                <Input
                  id="store-address"
                  value={store.address || ""}
                  onChange={(e) => setStore({ ...store, address: e.target.value })}
                  placeholder="Rua Exemplo, 123 - Centro"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="store-footer">Mensagem do Rodapé</Label>
                <Input
                  id="store-footer"
                  value={store.footer || ""}
                  onChange={(e) => setStore({ ...store, footer: e.target.value })}
                  placeholder="Obrigado pela preferência! Volte sempre."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="store-paper">Largura do Cupom</Label>
                <Select
                  value={store.paperWidth || "80"}
                  onValueChange={(val) => setStore({ ...store, paperWidth: val })}
                >
                  <SelectTrigger id="store-paper" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80">80mm (padrão térmica)</SelectItem>
                    <SelectItem value="58">58mm (mini impressora)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  No diálogo de impressão, selecione papel “80mm/Rolo” (ou “Salvar como PDF”) para sair no tamanho de cupom.
                </p>
              </div>

              <label
                htmlFor="auto-print"
                className="sm:col-span-2 flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer"
              >
                <div>
                  <span className="block text-sm font-medium">
                    Imprimir recibo automaticamente
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Ao finalizar a venda, abre a impressão do cupom. Se desligado, você imprime
                    manualmente pelo botão “Imprimir Recibo”.
                  </span>
                </div>
                <input
                  id="auto-print"
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => handleToggleAutoPrint(e.target.checked)}
                  className="h-5 w-5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSaveStore}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Salvar Dados da Loja
              </Button>
              <Button variant="outline" onClick={handlePreviewReceipt}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir Recibo de Exemplo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp (Evolution API) Card */}
        <Card className="border shadow-md md:col-span-2">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                WhatsApp (Evolution API)
                <Badge
                  variant="outline"
                  className={
                    evoConnected
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {evoConnected ? "Conectado" : "Desconectado"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Envia o comprovante da venda no WhatsApp do cliente automaticamente
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4 border-t">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="evo-url">URL do Servidor Evolution</Label>
                <Input
                  id="evo-url"
                  value={evo.baseUrl}
                  onChange={(e) => setEvo({ ...evo, baseUrl: e.target.value })}
                  placeholder="https://evolution.suaempresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evo-key">API Key (global)</Label>
                <Input
                  id="evo-key"
                  type="password"
                  value={evo.apiKey}
                  onChange={(e) => setEvo({ ...evo, apiKey: e.target.value })}
                  placeholder="••••••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="evo-instance">Nome da Instância</Label>
                <Input
                  id="evo-instance"
                  value={evo.instance}
                  onChange={(e) => setEvo({ ...evo, instance: e.target.value })}
                  placeholder="loja-principal"
                />
              </div>
            </div>

            {/* QR Code */}
            {evoQr && !evoConnected && (
              <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-sm font-medium">
                  Abra o WhatsApp → Aparelhos conectados → Conectar aparelho e escaneie:
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={evoQr}
                  alt="QR Code para conectar o WhatsApp"
                  className="h-56 w-56 rounded-lg border bg-white p-2"
                />
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando leitura...
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!evoConnected ? (
                <Button
                  onClick={handleConnectWhatsapp}
                  disabled={evoConnecting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  {evoConnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  {evoQr ? "Gerar novo QR" : "Conectar WhatsApp"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleDisconnectWhatsapp}
                  className="text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                >
                  <Link2Off className="mr-2 h-4 w-4" />
                  Desconectar
                </Button>
              )}
              <Button variant="outline" onClick={handleCheckWhatsapp} disabled={evoChecking}>
                {evoChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar status
              </Button>
            </div>

            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-semibold">Lembrete de crediário ao cliente</p>
                <p className="text-xs text-muted-foreground">
                  Envia automaticamente (às 9h) uma mensagem amigável ao cliente sobre parcelas que
                  vencem amanhã, hoje ou estão atrasadas. Requer WhatsApp conectado e telefone no
                  cadastro do cliente.
                </p>
              </div>
              <input
                type="checkbox"
                checked={waReminders}
                onChange={(e) => handleToggleWaReminders(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              Requer um servidor Evolution API ativo (com CORS liberado). As credenciais ficam
              salvas apenas neste navegador. O comprovante é enviado ao finalizar a venda, quando
              o cliente selecionado tiver telefone.
            </p>
          </CardContent>
        </Card>

        {/* Modelos de Mensagem Card */}
        <Card className="border shadow-md md:col-span-2">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Mensagens (Modelos)</CardTitle>
              <CardDescription>
                Edite os textos enviados aos clientes. Valem para o envio manual e o automático das 9h.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 border-t pt-4">
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Variáveis disponíveis:</span>{" "}
              <code>{"{primeiro_nome}"}</code>, <code>{"{cliente}"}</code>, <code>{"{valor}"}</code>,{" "}
              <code>{"{vencimento}"}</code>, <code>{"{pix}"}</code>, <code>{"{loja}"}</code>. Na
              confirmação de pagamento também: <code>{"{valor_pago}"}</code>, <code>{"{parcela}"}</code>,{" "}
              <code>{"{venda}"}</code>, <code>{"{status_parcela}"}</code>, <code>{"{saldo_linha}"}</code>.
            </div>

            {(
              [
                {
                  key: "lembrete_vespera" as const,
                  label: "Lembrete — vence amanhã",
                  preview: previewCollection("vespera"),
                },
                {
                  key: "lembrete_hoje" as const,
                  label: "Lembrete — vence hoje",
                  preview: previewCollection("hoje"),
                },
                {
                  key: "lembrete_atraso" as const,
                  label: "Lembrete — parcela atrasada",
                  preview: previewCollection("atraso"),
                },
                {
                  key: "confirmacao_pagamento" as const,
                  label: "Confirmação de pagamento",
                  preview: previewPayment(),
                },
              ]
            ).map((t) => (
              <div key={t.key} className="space-y-1.5">
                <label className="text-sm font-semibold">{t.label}</label>
                <Textarea
                  value={templates[t.key]}
                  onChange={(e) =>
                    setTemplates((prev) => ({ ...prev, [t.key]: e.target.value }))
                  }
                  className="min-h-32 font-mono text-xs"
                />
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Ver prévia</summary>
                  <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-[11px]">
                    {t.preview}
                  </pre>
                </details>
              </div>
            ))}

            <div className="space-y-1.5 border-t pt-4">
              <label className="text-sm font-semibold">Comprovante de venda (Nova Venda)</label>
              <p className="text-xs text-muted-foreground">
                Enviado ao finalizar a venda. Os blocos automáticos entram pelas variáveis:{" "}
                <code>{"{loja}"}</code>, <code>{"{contato}"}</code>, <code>{"{numero}"}</code>,{" "}
                <code>{"{data}"}</code>, <code>{"{cliente_linha}"}</code>, <code>{"{itens}"}</code>,{" "}
                <code>{"{resumo}"}</code>, <code>{"{parcelas}"}</code>, <code>{"{rodape}"}</code>,{" "}
                <code>{"{pix}"}</code>. (Itens e valores são preenchidos automaticamente.)
              </p>
              <Textarea
                value={templates.comprovante_venda}
                onChange={(e) =>
                  setTemplates((prev) => ({ ...prev, comprovante_venda: e.target.value }))
                }
                className="min-h-40 font-mono text-xs"
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Ver prévia</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-[11px]">
                  {previewReceipt()}
                </pre>
              </details>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={handleResetTemplates} className="sm:w-auto">
                Restaurar padrão
              </Button>
              <Button
                onClick={handleSaveTemplates}
                disabled={savingTpl}
                className="bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              >
                {savingTpl && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar Mensagens
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notificações Push Card */}
        <Card className="border shadow-md md:col-span-2">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20">
              <Bell className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                Notificações de Cobrança
                <Badge
                  variant="outline"
                  className={
                    pushEnabled
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {pushEnabled ? "Ativas neste aparelho" : "Desativadas"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Receba um lembrete (às 9h) quando uma parcela do crediário vence amanhã, vence hoje ou está atrasada
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 border-t">
            {!pushSupported ? (
              <p className="text-sm text-muted-foreground">
                Este navegador não suporta notificações. Em iPhone, instale o app na tela
                inicial (Compartilhar → Adicionar à Tela de Início) e abra por lá.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {!pushEnabled ? (
                    <Button
                      onClick={handleEnablePush}
                      disabled={pushBusy}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                    >
                      {pushBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="mr-2 h-4 w-4" />
                      )}
                      Ativar notificações neste aparelho
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleDisablePush}
                      disabled={pushBusy}
                      className="text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                    >
                      {pushBusy ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <BellOff className="mr-2 h-4 w-4" />
                      )}
                      Desativar neste aparelho
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Ative em cada aparelho onde quiser receber. As notificações funcionam com o
                  app instalado (PWA) e só são enviadas para administradores. O sininho no topo
                  guarda o histórico.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
