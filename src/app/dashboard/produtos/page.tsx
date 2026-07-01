"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Product, ProductCategory } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  Tags,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ImagePlus,
  X,
  Sparkles,
  Copy,
  Barcode,
  Download,
  Megaphone,
  Share2,
} from "lucide-react";
import { getStoreInfo } from "@/lib/receipt";
import { generateStoryBlob, slugify } from "@/lib/story";
import { postStatusToWhatsapp } from "@/lib/whatsapp";
import Image from "next/image";
import { toast } from "sonner";

const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Carrega a biblioteca SheetJS (XLSX) via CDN, uma única vez
function loadXLSX(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.XLSX) return resolve(w.XLSX);
    const existing = document.getElementById("xlsx-lib") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(w.XLSX));
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar a planilha.")));
      return;
    }
    const s = document.createElement("script");
    s.id = "xlsx-lib";
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.async = true;
    s.onload = () => resolve(w.XLSX);
    s.onerror = () => reject(new Error("Falha ao carregar a planilha."));
    document.head.appendChild(s);
  });
}

export default function ProdutosPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search & Filter State
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Product Dialog State
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isLabelsOpen, setIsLabelsOpen] = useState(false);
  const [isGeneratingBarcodes, setIsGeneratingBarcodes] = useState(false);
  const [isGeneratingFormBarcode, setIsGeneratingFormBarcode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Artes de divulgação (Story)
  const [isStoriesOpen, setIsStoriesOpen] = useState(false);
  const [isGeneratingStories, setIsGeneratingStories] = useState(false);
  const [postingStatusId, setPostingStatusId] = useState<string | null>(null);
  const [stories, setStories] = useState<
    { id: string; name: string; caption: string; url: string; blob: Blob }[]
  >([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: "",
    description: "",
    sku: "",
    barcode: "",
    category_id: "",
    cost_price: "",
    sale_price: "",
    stock_quantity: "",
    min_stock: "",
    unit: "un",
    is_active: true,
  });
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Variations State
  const [hasVariations, setHasVariations] = useState(false);
  const [attribute1Name, setAttribute1Name] = useState("Cor");
  const [attribute1Values, setAttribute1Values] = useState("");
  const [attribute2Name, setAttribute2Name] = useState("Tamanho");
  const [attribute2Values, setAttribute2Values] = useState("");

  interface VariantFormItem {
    id?: string;
    attributes: Record<string, string>;
    sku: string;
    barcode: string;
    cost_price: string;
    sale_price: string;
    stock_quantity: string;
    min_stock: string;
    is_active: boolean;
  }
  const [variantsFormList, setVariantsFormList] = useState<VariantFormItem[]>([]);

  const generateCombinations = useCallback(() => {
    const attr1NameClean = attribute1Name.trim().toLowerCase();
    const attr2NameClean = attribute2Name.trim().toLowerCase();
    
    const attr1Vals = attribute1Values
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");
      
    const attr2Vals = attribute2Values
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v !== "");

    if (attr1Vals.length === 0 && attr2Vals.length === 0) {
      setVariantsFormList([]);
      return;
    }

    // Generate combinations
    const combinations: Record<string, string>[] = [];
    if (attr1Vals.length > 0 && attr2Vals.length > 0) {
      attr1Vals.forEach((v1) => {
        attr2Vals.forEach((v2) => {
          combinations.push({
            [attr1NameClean]: v1,
            [attr2NameClean]: v2,
          });
        });
      });
    } else if (attr1Vals.length > 0) {
      attr1Vals.forEach((v1) => {
        combinations.push({
          [attr1NameClean]: v1,
        });
      });
    } else if (attr2Vals.length > 0) {
      attr2Vals.forEach((v2) => {
        combinations.push({
          [attr2NameClean]: v2,
        });
      });
    }

    setVariantsFormList((prev) => {
      return combinations.map((combo) => {
        // Try to match with existing in prev
        const existing = prev.find((p) => {
          return Object.keys(combo).every((key) => p.attributes[key] === combo[key]);
        });

        if (existing) return existing;

        // Auto-generate SKU
        const suffix = Object.values(combo)
          .map((v) => v.toUpperCase().substring(0, 3))
          .join("-");
        const parentSku = productForm.sku || "";
        const suggestedSku = parentSku ? `${parentSku}-${suffix}` : "";

        return {
          attributes: combo,
          sku: suggestedSku,
          barcode: "",
          cost_price: productForm.cost_price || "0",
          sale_price: productForm.sale_price || "0",
          stock_quantity: "0",
          min_stock: "0",
          is_active: true,
        };
      });
    });
  }, [attribute1Name, attribute1Values, attribute2Name, attribute2Values, productForm.sku, productForm.cost_price, productForm.sale_price]);

  // Helper to convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Helper to convert Image URL to base64
  const urlToBase64 = async (url: string): Promise<{ data: string; mimeType: string }> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(",")[1];
        resolve({ data: base64Data, mimeType: blob.type });
      };
      reader.onerror = (error) => reject(error);
    });
  };

  async function handleGenerateProductDetails() {
    const apiKey = localStorage.getItem("app_vendas_gemini_key");
    const model = localStorage.getItem("app_vendas_gemini_model") || "gemini-2.5-flash";

    if (!apiKey) {
      toast.error("Configuração de IA Ausente", {
        description: "Configure a Chave de API do Gemini em 'Configurações' do sistema.",
      });
      return;
    }

    if (!imagePreview) {
      toast.error("Imagem Necessária", {
        description: "Envie uma imagem do produto primeiro para que a IA possa analisá-la.",
      });
      return;
    }

    setIsGeneratingAI(true);
    const toastId = toast.loading("IA analisando a imagem...");

    try {
      let base64Data = "";
      let mimeType = "";

      if (imageFile) {
        base64Data = await fileToBase64(imageFile);
        mimeType = imageFile.type;
      } else if (currentImageUrl) {
        const res = await urlToBase64(currentImageUrl);
        base64Data = res.data;
        mimeType = res.mimeType;
      } else {
        throw new Error("Nenhuma imagem disponível para análise.");
      }

      const prompt = `Analise a imagem deste produto. Retorne obrigatoriamente e apenas um objeto JSON com as chaves 'name' (um nome comercial atrativo, curto e direto em português, exemplo: 'Garrafa Térmica Stanley 1L') e 'description' (uma descrição curta, comercial e profissional para este produto, destacando possíveis qualidades). Não coloque crases, blocos de código markdown ou texto extra, responda apenas o JSON puro.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      toast.dismiss(toastId);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Erro na chamada da API do Gemini.");
      }

      const responseData = await response.json();
      const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error("A IA não retornou um conteúdo válido.");
      }

      // Parse JSON
      const parsed = JSON.parse(textResponse.trim());
      if (parsed.name && parsed.description) {
        setProductForm((prev) => ({
          ...prev,
          name: parsed.name,
          description: parsed.description,
        }));
        toast.success("Nome e descrição gerados com sucesso!");
      } else {
        throw new Error("O formato do JSON retornado pela IA é inválido.");
      }
    } catch (error: any) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Erro na geração da IA", {
        description: error.message || "Tente novamente ou verifique sua API Key.",
      });
    } finally {
      setIsGeneratingAI(false);
    }
  }

  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);

  // Category Dialog State
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#3b82f6");
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Fetch Data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch categories
      const { data: catData, error: catError } = await supabase
        .from("product_categories")
        .select("*")
        .order("name");

      if (catError) throw catError;
      setCategories(catData || []);

      // 2. Fetch products
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .select(`
          *,
          category:product_categories(*)
        `)
        .order("name");

      if (prodError) throw prodError;
      setProducts(prodData || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao carregar dados", {
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter Products
  const filteredProducts = products
    .filter((p) => !p.parent_id)
    .filter((prod) => {
      const children = products.filter((p) => p.parent_id === prod.id);
      const matchesChildren = children.some(
        (c) =>
          c.sku?.toLowerCase().includes(search.toLowerCase()) ||
          c.barcode?.toLowerCase().includes(search.toLowerCase())
      );

      const matchesSearch =
        prod.name.toLowerCase().includes(search.toLowerCase()) ||
        prod.sku?.toLowerCase().includes(search.toLowerCase()) ||
        prod.barcode?.toLowerCase().includes(search.toLowerCase()) ||
        matchesChildren;

      const matchesCategory =
        selectedCategory === "all" || prod.category_id === selectedCategory;

      return matchesSearch && matchesCategory;
    });

  // Open Dialog to Create Product
  function handleAddProduct() {
    setEditingProduct(null);
    setProductForm({
      name: "",
      description: "",
      sku: "",
      barcode: "",
      category_id: categories[0]?.id || "",
      cost_price: "",
      sale_price: "",
      stock_quantity: "0",
      min_stock: "0",
      unit: "un",
      is_active: true,
    });
    resetImageState(null);
    
    // Reset variations states
    setHasVariations(false);
    setAttribute1Name("Cor");
    setAttribute1Values("");
    setAttribute2Name("Tamanho");
    setAttribute2Values("");
    setVariantsFormList([]);

    setIsProductDialogOpen(true);
  }

  // Open Dialog to Edit Product
  function handleEditProduct(product: Product) {
    setEditingProduct(product);
    resetImageState(product.image_url);
    
    // Find variants in products state
    const dbVariants = products.filter((p) => p.parent_id === product.id);
    
    if (dbVariants.length > 0) {
      setHasVariations(true);
      
      const attrKeys = Array.from(
        new Set(dbVariants.flatMap((v) => Object.keys(v.attributes || {})))
      );
      
      const attr1Key = attrKeys[0] || "cor";
      const attr2Key = attrKeys[1] || "tamanho";
      
      setAttribute1Name(attr1Key.charAt(0).toUpperCase() + attr1Key.slice(1));
      setAttribute2Name(attr2Key.charAt(0).toUpperCase() + attr2Key.slice(1));
      
      const attr1Vals = Array.from(
        new Set(dbVariants.map((v) => v.attributes?.[attr1Key] || "").filter(Boolean))
      );
      const attr2Vals = Array.from(
        new Set(dbVariants.map((v) => v.attributes?.[attr2Key] || "").filter(Boolean))
      );
      
      setAttribute1Values(attr1Vals.join(", "));
      setAttribute2Values(attr2Vals.join(", "));
      
      setVariantsFormList(
        dbVariants.map((v) => ({
          id: v.id,
          attributes: v.attributes as Record<string, string>,
          sku: v.sku || "",
          barcode: v.barcode || "",
          cost_price: v.cost_price.toString(),
          sale_price: v.sale_price.toString(),
          stock_quantity: v.stock_quantity.toString(),
          min_stock: v.min_stock.toString(),
          is_active: v.is_active,
        }))
      );
    } else {
      setHasVariations(false);
      setAttribute1Name("Cor");
      setAttribute1Values("");
      setAttribute2Name("Tamanho");
      setAttribute2Values("");
      setVariantsFormList([]);
    }

    setProductForm({
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      category_id: product.category_id || "",
      cost_price: product.cost_price.toString(),
      sale_price: product.sale_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock: product.min_stock.toString(),
      unit: product.unit || "un",
      is_active: product.is_active,
    });
    setIsProductDialogOpen(true);
  }

  // Duplicar produto: abre o cadastro pré-preenchido como NOVO produto
  async function handleDuplicateProduct(product: Product) {
    setEditingProduct(null);
    resetImageState(product.image_url); // mostra a imagem original de imediato

    // Pré-preenche variações (se houver), porém como novas (sem ids/sku/barcode)
    const dbVariants = products.filter((p) => p.parent_id === product.id);
    if (dbVariants.length > 0) {
      setHasVariations(true);
      const attrKeys = Array.from(
        new Set(dbVariants.flatMap((v) => Object.keys(v.attributes || {})))
      );
      const attr1Key = attrKeys[0] || "cor";
      const attr2Key = attrKeys[1] || "tamanho";
      setAttribute1Name(attr1Key.charAt(0).toUpperCase() + attr1Key.slice(1));
      setAttribute2Name(attr2Key.charAt(0).toUpperCase() + attr2Key.slice(1));
      setAttribute1Values(
        Array.from(new Set(dbVariants.map((v) => v.attributes?.[attr1Key] || "").filter(Boolean))).join(", ")
      );
      setAttribute2Values(
        Array.from(new Set(dbVariants.map((v) => v.attributes?.[attr2Key] || "").filter(Boolean))).join(", ")
      );
      setVariantsFormList(
        dbVariants.map((v) => ({
          id: "", // vazio => criado como nova variação
          attributes: v.attributes as Record<string, string>,
          sku: "",
          barcode: "",
          cost_price: v.cost_price.toString(),
          sale_price: v.sale_price.toString(),
          stock_quantity: v.stock_quantity.toString(),
          min_stock: v.min_stock.toString(),
          is_active: v.is_active,
        }))
      );
    } else {
      setHasVariations(false);
      setAttribute1Name("Cor");
      setAttribute1Values("");
      setAttribute2Name("Tamanho");
      setAttribute2Values("");
      setVariantsFormList([]);
    }

    setProductForm({
      name: `${product.name} (Cópia)`,
      description: product.description || "",
      sku: "", // SKU e código de barras são únicos: limpar para evitar conflito
      barcode: "",
      category_id: product.category_id || "",
      cost_price: product.cost_price.toString(),
      sale_price: product.sale_price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock: product.min_stock.toString(),
      unit: product.unit || "un",
      is_active: product.is_active,
    });
    setIsProductDialogOpen(true);

    // Copia a imagem para um novo arquivo, para o duplicado ter imagem própria
    if (product.image_url) {
      const newUrl = await copyImageInBucket(product.image_url);
      setCurrentImageUrl(newUrl);
      setImagePreview(newUrl);
    }
  }

  // Copia um arquivo de imagem dentro do bucket e retorna a nova URL pública
  async function copyImageInBucket(publicUrl: string | null): Promise<string | null> {
    if (!publicUrl) return null;
    const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return publicUrl;
    const fromPath = publicUrl.slice(idx + marker.length);
    const ext = fromPath.split(".").pop() || "jpg";
    const toPath = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .copy(fromPath, toPath);
    if (error) return publicUrl; // fallback: reaproveita a mesma imagem
    const { data } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(toPath);
    return data.publicUrl;
  }

  // ---- Image helpers ----
  function resetImageState(existingUrl: string | null) {
    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(existingUrl);
    setCurrentImageUrl(existingUrl);
    setImageRemoved(false);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error("Formato inválido", {
        description: "Use uma imagem JPG, PNG, WEBP ou GIF.",
      });
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      toast.error("Imagem muito grande", {
        description: "O tamanho máximo é 5MB.",
      });
      return;
    }

    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageRemoved(false);
  }

  function handleRemoveImage() {
    if (imagePreview && imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
    setImageRemoved(true);
  }

  // Faz upload do arquivo e retorna a URL pública
  async function uploadProductImage(file: File): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  // Remove a imagem antiga do bucket a partir da URL pública
  async function removeImageFromBucket(publicUrl: string | null) {
    if (!publicUrl) return;
    const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  }

  // Save Product (Create or Update)
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) {
      toast.error("Acesso negado", {
        description: "Apenas administradores podem gerenciar produtos.",
      });
      return;
    }

    setIsSavingProduct(true);
    try {
      // Resolve a imagem: faz upload se houver arquivo novo,
      // mantém a atual, ou limpa se foi removida.
      let imageUrl: string | null = currentImageUrl;
      if (imageFile) {
        imageUrl = await uploadProductImage(imageFile);
      } else if (imageRemoved) {
        imageUrl = null;
      }

      const payload = {
        name: productForm.name,
        description: productForm.description || null,
        sku: productForm.sku || null,
        barcode: productForm.barcode || null,
        category_id: productForm.category_id || null,
        cost_price: parseFloat(productForm.cost_price) || 0,
        sale_price: parseFloat(productForm.sale_price) || 0,
        stock_quantity: hasVariations ? 0 : (parseInt(productForm.stock_quantity) || 0),
        min_stock: hasVariations ? 0 : (parseInt(productForm.min_stock) || 0),
        unit: productForm.unit,
        is_active: productForm.is_active,
        image_url: imageUrl,
        parent_id: null,
        attributes: null,
      };

      let parentId = "";

      if (editingProduct) {
        parentId = editingProduct.id;
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", parentId);

        if (error) throw error;

        // Limpa a imagem antiga do bucket se foi trocada ou removida
        if (
          (imageFile || imageRemoved) &&
          currentImageUrl &&
          currentImageUrl !== imageUrl
        ) {
          await removeImageFromBucket(currentImageUrl);
        }
      } else {
        // Create parent
        const { data, error } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        parentId = data.id;
      }

      // Handle Variations
      if (hasVariations) {
        // Fetch current variants in database
        const { data: dbVariants } = await supabase
          .from("products")
          .select("id")
          .eq("parent_id", parentId);

        const dbVariantIds = (dbVariants as { id: string }[] | null)?.map((v) => v.id) || [];
        const currentFormVariantIds = variantsFormList.map((v) => v.id).filter(Boolean) as string[];

        // 1. Delete variants that are no longer in the form list
        const idsToDelete = dbVariantIds.filter((id) => !currentFormVariantIds.includes(id));
        if (idsToDelete.length > 0) {
          const { error: delError } = await supabase
            .from("products")
            .delete()
            .in("id", idsToDelete);
          if (delError) throw delError;
        }

        // 2. Insert or update variants
        for (const variant of variantsFormList) {
          const attrValuesStr = Object.values(variant.attributes).join(" / ");
          const variantName = `${productForm.name} - ${attrValuesStr}`;

          const variantPayload = {
            name: variantName,
            description: productForm.description || null,
            sku: variant.sku || null,
            barcode: variant.barcode || null,
            category_id: productForm.category_id || null,
            cost_price: parseFloat(variant.cost_price) || 0,
            sale_price: parseFloat(variant.sale_price) || 0,
            stock_quantity: parseInt(variant.stock_quantity) || 0,
            min_stock: parseInt(variant.min_stock) || 0,
            unit: productForm.unit,
            is_active: variant.is_active,
            image_url: imageUrl,
            parent_id: parentId,
            attributes: variant.attributes,
          };

          if (variant.id) {
            // Update existing variant
            const { error: variantError } = await supabase
              .from("products")
              .update(variantPayload)
              .eq("id", variant.id);
            if (variantError) throw variantError;
          } else {
            // Create new variant
            const { error: variantError } = await supabase
              .from("products")
              .insert(variantPayload);
            if (variantError) throw variantError;
          }
        }
      } else {
        // If product is no longer variable, clean up any database variations
        if (editingProduct) {
          const { error: cleanupError } = await supabase
            .from("products")
            .delete()
            .eq("parent_id", parentId);
          if (cleanupError) throw cleanupError;
        }
      }

      toast.success(editingProduct ? "Produto atualizado com sucesso!" : "Produto cadastrado com sucesso!");
      setIsProductDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao salvar produto", {
        description: error.message,
      });
    } finally {
      setIsSavingProduct(false);
    }
  }

  // ---- Etiquetas / códigos de barras ----
  // Produtos vendáveis = simples + variações (exclui o "pai" que tem variações)
  const sellableProducts = products.filter(
    (p) => !products.some((c) => c.parent_id === p.id)
  );

  // Expande a seleção (linhas são produtos de topo): pais viram suas variações
  const expandSelection = (ids: Set<string>): Product[] => {
    const out: Product[] = [];
    ids.forEach((id) => {
      const children = products.filter((p) => p.parent_id === id);
      if (children.length > 0) {
        out.push(...children);
      } else {
        const p = products.find((x) => x.id === id);
        if (p) out.push(p);
      }
    });
    return out;
  };

  // Escopo das etiquetas: seleção (se houver) ou todos os vendáveis
  const labelScope =
    selectedIds.size > 0 ? expandSelection(selectedIds) : sellableProducts;
  const missingBarcodeCount = labelScope.filter(
    (p) => !p.barcode || p.barcode.trim() === ""
  ).length;
  const readyForLabelCount = labelScope.filter(
    (p) => p.barcode && p.barcode.trim() !== ""
  ).length;

  async function handleGenerateFormBarcode() {
    setIsGeneratingFormBarcode(true);
    try {
      const { data, error } = await supabase.rpc("next_barcode");
      if (error) throw error;
      if (data) setProductForm((f) => ({ ...f, barcode: data as string }));
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao gerar código", { description: error.message });
    } finally {
      setIsGeneratingFormBarcode(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const allSelected = filteredProducts.every((p) => prev.has(p.id));
      if (allSelected) return new Set();
      return new Set(filteredProducts.map((p) => p.id));
    });
  }

  async function handleGenerateBarcodes() {
    setIsGeneratingBarcodes(true);
    try {
      let count: number | null = null;
      if (selectedIds.size > 0) {
        const ids = labelScope
          .filter((p) => !p.barcode || p.barcode.trim() === "")
          .map((p) => p.id);
        const { data, error } = await supabase.rpc("generate_barcodes_for", { p_ids: ids });
        if (error) throw error;
        count = data;
      } else {
        const { data, error } = await supabase.rpc("generate_missing_barcodes");
        if (error) throw error;
        count = data;
      }
      toast.success(`${count ?? 0} código(s) de barras gerado(s).`);
      await fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao gerar códigos", { description: error.message });
    } finally {
      setIsGeneratingBarcodes(false);
    }
  }

  async function handleRegenerateBarcodes() {
    const scopeLabel =
      selectedIds.size > 0 ? `${selectedIds.size} produto(s) selecionado(s)` : "TODOS os produtos";
    if (
      !confirm(
        `Substituir os códigos de barras de ${scopeLabel} por códigos curtos? Etiquetas já impressas com os códigos antigos deixarão de funcionar.`
      )
    )
      return;
    setIsGeneratingBarcodes(true);
    try {
      const ids = selectedIds.size > 0 ? labelScope.map((p) => p.id) : null;
      const { data, error } = await supabase.rpc("regenerate_barcodes_for", { p_ids: ids });
      if (error) throw error;
      toast.success(`${data ?? 0} código(s) regerado(s).`);
      await fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao regerar códigos", { description: error.message });
    } finally {
      setIsGeneratingBarcodes(false);
    }
  }

  async function handleExportLabels() {
    const rows = labelScope.filter((p) => p.barcode && p.barcode.trim() !== "");
    if (rows.length === 0) {
      toast.error("Nenhum produto com código de barras para exportar.");
      return;
    }
    try {
      const XLSX = await loadXLSX();
      const aoa = [
        ["Nome", "CodigoBarras", "Preco"],
        ...rows.map((p) => [
          p.name,
          String(p.barcode), // string => preserva zeros à esquerda
          `R$ ${p.sale_price.toFixed(2).replace(".", ",")}`,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      // Força a coluna B (CodigoBarras) como TEXTO (mantém 000130)
      rows.forEach((_, i) => {
        const ref = `B${i + 2}`;
        if (ws[ref]) {
          ws[ref].t = "s";
          ws[ref].z = "@";
        }
      });
      ws["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Etiquetas");
      XLSX.writeFile(wb, `etiquetas-produtos-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Planilha exportada (${rows.length} produtos).`);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao exportar a planilha", { description: error.message });
    }
  }

  // ---- Artes de divulgação (Story) ----
  async function handleOpenStories() {
    const scope = (selectedIds.size > 0 ? labelScope : sellableProducts).slice(0, 20);
    if (scope.length === 0) {
      toast.error("Selecione ao menos um produto.");
      return;
    }
    setIsGeneratingStories(true);
    // limpa artes anteriores
    stories.forEach((s) => URL.revokeObjectURL(s.url));
    setStories([]);
    setIsStoriesOpen(true);
    try {
      const store = getStoreInfo();
      const result: { id: string; name: string; caption: string; url: string; blob: Blob }[] = [];
      for (const p of scope) {
        const priceText = `R$ ${p.sale_price.toFixed(2).replace(".", ",")}`;
        const blob = await generateStoryBlob({
          storeName: store.name,
          phone: store.phone,
          productName: p.name,
          priceText,
          imageUrl: p.image_url,
        });
        result.push({
          id: p.id,
          name: p.name,
          caption: `${p.name} — ${priceText}`,
          url: URL.createObjectURL(blob),
          blob,
        });
      }
      setStories(result);
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao gerar as artes", { description: error.message });
    } finally {
      setIsGeneratingStories(false);
    }
  }

  function closeStories() {
    stories.forEach((s) => URL.revokeObjectURL(s.url));
    setStories([]);
    setIsStoriesOpen(false);
  }

  async function shareStory(s: { name: string; blob: Blob }) {
    const file = new File([s.blob], `${slugify(s.name) || "produto"}.jpg`, {
      type: "image/jpeg",
    });
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: s.name });
      } catch {
        // usuário cancelou — ok
      }
    } else {
      downloadStory(s);
      toast.info("Compartilhamento direto não suportado aqui; imagem baixada.");
    }
  }

  function downloadStory(s: { name: string; url?: string; blob: Blob }) {
    const url = s.url || URL.createObjectURL(s.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `story-${slugify(s.name) || "produto"}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handlePostStatus(s: {
    id: string;
    caption: string;
    blob: Blob;
  }) {
    setPostingStatusId(s.id);
    let uploadedPath: string | null = null;
    try {
      // Sobe a arte no bucket público e envia a URL para a Evolution
      const path = `stories/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(path, s.blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      uploadedPath = path;

      const { data: urlData } = supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .getPublicUrl(path);

      const sent = await postStatusToWhatsapp(supabase, urlData.publicUrl, s.caption);
      if (sent) {
        toast.success("Postado no Status do WhatsApp!");
      } else {
        toast.error("WhatsApp não conectado.", {
          description: "Conecte em Configurações para postar no Status.",
        });
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Falha ao postar no Status", { description: error.message });
    } finally {
      // Remove a arte do bucket depois (a Evolution já baixou ao postar)
      if (uploadedPath) {
        const p = uploadedPath;
        setTimeout(() => {
          supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([p]).catch(() => {});
        }, 30000);
      }
      setPostingStatusId(null);
    }
  }

  // Delete Product
  async function handleDeleteProduct(id: string) {
    if (!isAdmin) return;
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      toast.success("Produto excluído com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao excluir produto", {
        description: error.message,
      });
    }
  }

  // Save Category
  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!newCategoryName.trim()) return;

    setIsSavingCategory(true);
    try {
      const { error } = await supabase.from("product_categories").insert({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || null,
        color: newCategoryColor,
      });

      if (error) throw error;

      toast.success("Categoria criada com sucesso!");
      setNewCategoryName("");
      setNewCategoryDescription("");
      setNewCategoryColor("#3b82f6");
      fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao criar categoria", {
        description: error.message,
      });
    } finally {
      setIsSavingCategory(false);
    }
  }

  // Delete Category
  async function handleDeleteCategory(id: string) {
    if (!isAdmin) return;
    if (!confirm("Tem certeza que deseja excluir esta categoria? Os produtos vinculados a ela ficarão sem categoria.")) return;

    try {
      const { error } = await supabase.from("product_categories").delete().eq("id", id);
      if (error) throw error;

      toast.success("Categoria excluída!");
      fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao excluir categoria", {
        description: error.message,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Produtos</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu catálogo de produtos, controle de estoque e preços.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading && "animate-spin"}`} />
            Atualizar
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setIsLabelsOpen(true)}>
                <Barcode className="h-4 w-4 mr-2" />
                Etiquetas
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenStories}>
                <Megaphone className="h-4 w-4 mr-2" />
                Divulgar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsCategoryDialogOpen(true)}>
                <Tags className="h-4 w-4 mr-2" />
                Categorias
              </Button>
              <Button size="sm" onClick={handleAddProduct} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
                <Plus className="h-4 w-4 mr-2" />
                Novo Produto
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Barra de seleção */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-2.5">
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {selectedIds.size} produto(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleOpenStories}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Megaphone className="mr-1.5 h-4 w-4" />
              Divulgar
            </Button>
            <Button
              size="sm"
              onClick={() => setIsLabelsOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Barcode className="mr-1.5 h-4 w-4" />
              Etiquetas
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, SKU ou código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full md:w-64">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-muted-foreground text-sm">Carregando produtos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-2 p-4 text-center">
            <Package className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-semibold text-lg">Nenhum produto encontrado</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Tente redefinir seus filtros ou cadastrar um novo produto.
            </p>
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos"
                        checked={
                          filteredProducts.length > 0 &&
                          filteredProducts.every((p) => selectedIds.has(p.id))
                        }
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[220px]">Produto</TableHead>
                  <TableHead>SKU / Cód. Barras</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Venda</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  {isAdmin && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((prod) => {
                  const children = products.filter((p) => p.parent_id === prod.id);
                  const hasVariants = children.length > 0;

                  // Stock calculations
                  const totalStock = hasVariants
                    ? children.reduce((sum, v) => sum + v.stock_quantity, 0)
                    : prod.stock_quantity;
                  const totalMinStock = hasVariants
                    ? children.reduce((sum, v) => sum + v.min_stock, 0)
                    : prod.min_stock;
                  const isLowStock = totalStock <= totalMinStock;

                  // Price calculations
                  const costPrices = children.map((c) => c.cost_price);
                  const salePrices = children.map((c) => c.sale_price);

                  const minCost = hasVariants ? Math.min(...costPrices) : prod.cost_price;
                  const maxCost = hasVariants ? Math.max(...costPrices) : prod.cost_price;
                  const costPriceStr = hasVariants
                    ? minCost === maxCost
                      ? `R$ ${minCost.toFixed(2)}`
                      : `R$ ${minCost.toFixed(2)} - R$ ${maxCost.toFixed(2)}`
                    : `R$ ${prod.cost_price.toFixed(2)}`;

                  const minSale = hasVariants ? Math.min(...salePrices) : prod.sale_price;
                  const maxSale = hasVariants ? Math.max(...salePrices) : prod.sale_price;
                  const salePriceStr = hasVariants
                    ? minSale === maxSale
                      ? `R$ ${minSale.toFixed(2)}`
                      : `R$ ${minSale.toFixed(2)} - R$ ${maxSale.toFixed(2)}`
                    : `R$ ${prod.sale_price.toFixed(2)}`;

                  return (
                    <TableRow key={prod.id} className="hover:bg-muted/30">
                      {isAdmin && (
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${prod.name}`}
                            checked={selectedIds.has(prod.id)}
                            onChange={() => toggleSelect(prod.id)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                            {prod.image_url ? (
                              <Image
                                src={prod.image_url}
                                alt={prod.name}
                                fill
                                sizes="40px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                                <Package className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {isAdmin ? (
                                <button
                                  onClick={() => handleEditProduct(prod)}
                                  title={prod.name}
                                  className="block truncate max-w-[150px] font-semibold text-left transition-colors hover:text-indigo-600 hover:underline"
                                >
                                  {prod.name}
                                </button>
                              ) : (
                                <p className="block truncate max-w-[150px] font-semibold">{prod.name}</p>
                              )}
                              {hasVariants && (
                                <Badge variant="secondary" className="shrink-0 text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20 font-bold px-1.5 py-0.5">
                                  {children.length} var.
                                </Badge>
                              )}
                            </div>
                            {prod.description && (
                              <p className="truncate max-w-[190px] text-xs text-muted-foreground">
                                {prod.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {hasVariants ? (
                          <span className="text-xs text-muted-foreground italic">Grade de variação</span>
                        ) : (
                          <div className="space-y-0.5">
                            {prod.sku && <p>SKU: {prod.sku}</p>}
                            {prod.barcode && <p>BC: {prod.barcode}</p>}
                            {!prod.sku && !prod.barcode && <p className="text-xs italic">-</p>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {prod.category ? (
                          <Badge
                            style={{
                              backgroundColor: `${prod.category.color}15`,
                              color: prod.category.color || "inherit",
                              borderColor: `${prod.category.color}30`,
                            }}
                            variant="outline"
                            className="font-medium"
                          >
                            {prod.category.name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 font-semibold">
                          <span className={isLowStock ? "text-amber-500" : ""}>
                            {totalStock} {prod.unit}
                          </span>
                          {isLowStock && (
                            <span title="Estoque baixo!">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {costPriceStr}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-indigo-500">
                        {salePriceStr}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={prod.is_active ? "outline" : "secondary"}
                          className={
                            prod.is_active
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                              : ""
                          }
                        >
                          {prod.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditProduct(prod)}
                              title="Editar"
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDuplicateProduct(prod)}
                              title="Duplicar"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteProduct(prod.id)}
                              title="Excluir"
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* ----- Lista simplificada (celular) ----- */}
          <div className="divide-y md:hidden">
            {filteredProducts.map((prod) => {
              const children = products.filter((p) => p.parent_id === prod.id);
              const hasVariants = children.length > 0;
              const totalStock = hasVariants
                ? children.reduce((sum, v) => sum + v.stock_quantity, 0)
                : prod.stock_quantity;
              const totalMinStock = hasVariants
                ? children.reduce((sum, v) => sum + v.min_stock, 0)
                : prod.min_stock;
              const isLowStock = totalStock <= totalMinStock;
              const salePrices = children.map((c) => c.sale_price);
              const minSale = hasVariants ? Math.min(...salePrices) : prod.sale_price;
              const hasRange =
                hasVariants && Math.min(...salePrices) !== Math.max(...salePrices);

              return (
                <div key={prod.id} className="flex items-center gap-3 p-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${prod.name}`}
                      checked={selectedIds.has(prod.id)}
                      onChange={() => toggleSelect(prod.id)}
                      className="h-5 w-5 shrink-0 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  )}
                  <button
                    onClick={() => isAdmin && handleEditProduct(prod)}
                    disabled={!isAdmin}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                      {prod.image_url ? (
                        <Image
                          src={prod.image_url}
                          alt={prod.name}
                          fill
                          sizes="44px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-semibold">{prod.name}</p>
                        {!prod.is_active && (
                          <Badge variant="secondary" className="shrink-0 text-[9px]">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {hasRange ? "a partir de " : ""}R$ {minSale.toFixed(2)}
                        </span>
                        <span
                          className={`ml-2 text-xs ${
                            isLowStock ? "text-amber-500" : "text-muted-foreground"
                          }`}
                        >
                          {totalStock} {prod.unit} em estoque
                        </span>
                      </p>
                    </div>
                  </button>
                  {isAdmin && (
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicateProduct(prod)}
                        title="Duplicar"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteProduct(prod.id)}
                        title="Excluir"
                        className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </Card>

      {/* Product Add/Edit Dialog */}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo para cadastrar ou atualizar o produto no catálogo.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveProduct} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Nome do Produto *</Label>
                <Input
                  id="name"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  rows={2}
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label>Imagem do Produto</Label>
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                    {imagePreview ? (
                      <>
                        <Image
                          src={imagePreview}
                          alt="Pré-visualização"
                          fill
                          sizes="96px"
                          className="object-cover"
                          unoptimized
                        />
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          title="Remover imagem"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        <Package className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <input
                      id="product-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("product-image")?.click()}
                      >
                        <ImagePlus className="mr-2 h-4 w-4" />
                        {imagePreview ? "Trocar imagem" : "Enviar imagem"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!imagePreview || isGeneratingAI}
                        onClick={handleGenerateProductDetails}
                        className="bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-950 dark:hover:bg-purple-900 dark:text-purple-300 font-semibold shadow-sm transition-all"
                      >
                        {isGeneratingAI ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Gerando...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-4 w-4 text-purple-500" />
                            Preencher com IA
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, WEBP ou GIF. Máx. 5MB. Envie uma imagem para habilitar o preenchimento por IA.
                    </p>
                  </div>
                </div>
              </div>

              {/* Checkbox Variações */}
              <div className="col-span-2 flex items-center gap-2 border-y py-2.5 my-1">
                <input
                  type="checkbox"
                  id="has_variations"
                  checked={hasVariations}
                  onChange={(e) => setHasVariations(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="has_variations" className="font-bold cursor-pointer select-none text-indigo-600 dark:text-indigo-400">
                  Este produto possui variações (Grade de Tamanho, Cor, etc.)
                </Label>
              </div>

              {!hasVariations && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sku">SKU (Código Único)</Label>
                    <Input
                      id="sku"
                      placeholder="EX: BEB-COCA-350"
                      value={productForm.sku}
                      onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="barcode">Código de Barras</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="barcode"
                        placeholder="Código de barras"
                        value={productForm.barcode}
                        onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleGenerateFormBarcode}
                        disabled={isGeneratingFormBarcode}
                        title="Gerar código automático"
                        className="shrink-0"
                      >
                        {isGeneratingFormBarcode ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Barcode className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="category_id">Categoria *</Label>
                <Select
                  value={productForm.category_id}
                  onValueChange={(val) => setProductForm({ ...productForm, category_id: val })}
                >
                  <SelectTrigger id="category_id">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="unit">Unidade de Medida</Label>
                <Select
                  value={productForm.unit}
                  onValueChange={(val) => setProductForm({ ...productForm, unit: val })}
                >
                  <SelectTrigger id="unit">
                    <SelectValue placeholder="un" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="un">Unidade (un)</SelectItem>
                    <SelectItem value="kg">Quilo (kg)</SelectItem>
                    <SelectItem value="lt">Litro (lt)</SelectItem>
                    <SelectItem value="cx">Caixa (cx)</SelectItem>
                    <SelectItem value="pacote">Pacote (pct)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!hasVariations && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="cost_price">Preço de Custo (R$) *</Label>
                    <Input
                      id="cost_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.cost_price}
                      onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="sale_price">Preço de Venda (R$) *</Label>
                    <Input
                      id="sale_price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.sale_price}
                      onChange={(e) => setProductForm({ ...productForm, sale_price: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="stock_quantity">Qtd. Estoque Atual *</Label>
                    <Input
                      id="stock_quantity"
                      type="number"
                      min="0"
                      value={productForm.stock_quantity}
                      onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="min_stock">Qtd. Estoque Mínimo</Label>
                    <Input
                      id="min_stock"
                      type="number"
                      min="0"
                      value={productForm.min_stock}
                      onChange={(e) => setProductForm({ ...productForm, min_stock: e.target.value })}
                    />
                  </div>
                </>
              )}

              {hasVariations && (
                <div className="col-span-2 space-y-4 border p-4 rounded-xl bg-muted/20">
                  <h4 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    Configuração de Atributos da Grade
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="attr1-name" className="text-xs font-semibold">Atributo 1 (ex: Cor)</Label>
                      <Input
                        id="attr1-name"
                        value={attribute1Name}
                        onChange={(e) => setAttribute1Name(e.target.value)}
                        placeholder="Ex: Cor"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="attr1-values" className="text-xs font-semibold">Valores (separados por vírgula)</Label>
                      <Input
                        id="attr1-values"
                        value={attribute1Values}
                        onChange={(e) => setAttribute1Values(e.target.value)}
                        placeholder="Ex: Preta, Branca, Azul"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="attr2-name" className="text-xs font-semibold">Atributo 2 (ex: Tamanho)</Label>
                      <Input
                        id="attr2-name"
                        value={attribute2Name}
                        onChange={(e) => setAttribute2Name(e.target.value)}
                        placeholder="Ex: Tamanho"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="attr2-values" className="text-xs font-semibold">Valores (separados por vírgula)</Label>
                      <Input
                        id="attr2-values"
                        value={attribute2Values}
                        onChange={(e) => setAttribute2Values(e.target.value)}
                        placeholder="Ex: P, M, G"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateCombinations}
                    className="w-full text-xs h-8 border-indigo-200 hover:bg-indigo-50 font-semibold"
                  >
                    Gerar / Atualizar Grade de Variações
                  </Button>

                  {variantsFormList.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <Label className="text-xs font-bold text-muted-foreground uppercase">Grade Gerada</Label>
                      <div className="max-h-60 overflow-y-auto border rounded-lg bg-background p-2 space-y-3">
                        {variantsFormList.map((variant, index) => {
                          const label = Object.entries(variant.attributes)
                            .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
                            .join(" / ");
                          
                          return (
                            <div key={index} className="border-b pb-3 last:border-0 last:pb-0 space-y-2">
                              <div className="flex justify-between items-center bg-muted/30 p-1.5 rounded text-xs font-bold text-muted-foreground">
                                <span>{label}</span>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    id={`active-${index}`}
                                    checked={variant.is_active}
                                    onChange={(e) => {
                                      const updated = [...variantsFormList];
                                      updated[index].is_active = e.target.checked;
                                      setVariantsFormList(updated);
                                    }}
                                    className="h-3 w-3 rounded text-indigo-600"
                                  />
                                  <Label htmlFor={`active-${index}`} className="text-[10px] font-normal cursor-pointer select-none">Ativo</Label>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="space-y-1">
                                  <Label className="text-[10px]">SKU</Label>
                                  <Input
                                    value={variant.sku}
                                    onChange={(e) => {
                                      const updated = [...variantsFormList];
                                      updated[index].sku = e.target.value;
                                      setVariantsFormList(updated);
                                    }}
                                    className="h-7 text-xs font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Cód. Barras</Label>
                                  <Input
                                    value={variant.barcode}
                                    onChange={(e) => {
                                      const updated = [...variantsFormList];
                                      updated[index].barcode = e.target.value;
                                      setVariantsFormList(updated);
                                    }}
                                    className="h-7 text-xs font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Custo (R$)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={variant.cost_price}
                                    onChange={(e) => {
                                      const updated = [...variantsFormList];
                                      updated[index].cost_price = e.target.value;
                                      setVariantsFormList(updated);
                                    }}
                                    className="h-7 text-xs text-right font-semibold"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px]">Venda (R$)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={variant.sale_price}
                                    onChange={(e) => {
                                      const updated = [...variantsFormList];
                                      updated[index].sale_price = e.target.value;
                                      setVariantsFormList(updated);
                                    }}
                                    className="h-7 text-xs text-right font-semibold"
                                  />
                                </div>
                                <div className="space-y-1 col-span-2 grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-[10px]">Estoque</Label>
                                    <Input
                                      type="number"
                                      value={variant.stock_quantity}
                                      onChange={(e) => {
                                        const updated = [...variantsFormList];
                                        updated[index].stock_quantity = e.target.value;
                                        setVariantsFormList(updated);
                                      }}
                                      className="h-7 text-xs text-center"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px]">Estoque Mín.</Label>
                                    <Input
                                      type="number"
                                      value={variant.min_stock}
                                      onChange={(e) => {
                                        const updated = [...variantsFormList];
                                        updated[index].min_stock = e.target.value;
                                        setVariantsFormList(updated);
                                      }}
                                      className="h-7 text-xs text-center"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="col-span-2 flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={productForm.is_active}
                  onChange={(e) => setProductForm({ ...productForm, is_active: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Label htmlFor="is_active" className="font-normal cursor-pointer select-none">
                  Produto disponível para venda
                </Label>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsProductDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSavingProduct} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                {isSavingProduct && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Divulgação / Story Dialog */}
      <Dialog open={isStoriesOpen} onOpenChange={(o) => !o && closeStories()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Artes para divulgação (Story)</DialogTitle>
            <DialogDescription>
              Imagem pronta no formato Story. Toque em Compartilhar para postar no Status do
              WhatsApp (no celular) ou baixe a imagem.
            </DialogDescription>
          </DialogHeader>

          {isGeneratingStories ? (
            <div className="flex h-60 flex-col items-center justify-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="text-sm text-muted-foreground">Gerando as artes...</p>
            </div>
          ) : stories.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma arte gerada.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {stories.map((s) => (
                <div key={s.id} className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.name}
                    className="w-full rounded-lg border shadow-sm"
                  />
                  <div className="space-y-1.5">
                    <Button
                      size="sm"
                      onClick={() => handlePostStatus(s)}
                      disabled={postingStatusId === s.id}
                      className="h-8 w-full bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700"
                    >
                      {postingStatusId === s.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Megaphone className="mr-1 h-3.5 w-3.5" />
                      )}
                      Postar no Status
                    </Button>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => shareStory(s)}
                        className="h-8 flex-1 px-2 text-xs"
                      >
                        <Share2 className="mr-1 h-3.5 w-3.5" />
                        Compartilhar
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => downloadStory(s)}
                        title="Baixar"
                        className="h-8 w-8 shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={closeStories} className="w-full">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Labels / Barcode Dialog */}
      <Dialog open={isLabelsOpen} onOpenChange={setIsLabelsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Etiquetas e Códigos de Barras</DialogTitle>
            <DialogDescription>
              Gere os códigos de barras e exporte a planilha para o seu programa de etiquetas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Escopo */}
            <div
              className={`rounded-lg border p-2.5 text-xs ${
                selectedIds.size > 0
                  ? "border-indigo-500/30 bg-indigo-500/5 text-indigo-700 dark:text-indigo-300"
                  : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {selectedIds.size > 0
                ? `Aplicando a ${selectedIds.size} produto(s) selecionado(s).`
                : "Aplicando a todos os produtos."}
            </div>

            {/* Passo 1 */}
            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">1. Gerar códigos faltantes</p>
                  <p className="text-xs text-muted-foreground">
                    {missingBarcodeCount > 0
                      ? `${missingBarcodeCount} produto(s) sem código de barras.`
                      : "Todos já têm código. ✔️"}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleGenerateBarcodes}
                  disabled={isGeneratingBarcodes || missingBarcodeCount === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isGeneratingBarcodes ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Barcode className="mr-1.5 h-4 w-4" />
                  )}
                  Gerar
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Gera um código curto de 6 dígitos (Code 128) para cada produto sem código — fica
                compacto e fácil de ler na etiqueta. É o mesmo código que o PDV lê depois.
              </p>
              <button
                onClick={handleRegenerateBarcodes}
                disabled={isGeneratingBarcodes}
                className="mt-2 text-[11px] font-medium text-rose-600 hover:underline disabled:opacity-50"
              >
                Regerar (substituir) os códigos {selectedIds.size > 0 ? "selecionados" : "de todos"} →
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Use para trocar códigos antigos (longos) pelos curtos. Atenção: etiquetas já
                impressas com os códigos antigos param de funcionar.
              </p>
            </div>

            {/* Passo 2 */}
            <div className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">2. Exportar planilha</p>
                  <p className="text-xs text-muted-foreground">
                    {readyForLabelCount} produto(s) prontos para etiqueta.
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={handleExportLabels}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Gera um arquivo com as colunas <b>Nome</b>, <b>CodigoBarras</b> e <b>Preco</b>. No
                seu programa de etiquetas, importe esse arquivo e ligue cada coluna ao campo
                correspondente (texto, código de barras e preço).
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setIsLabelsOpen(false)} className="w-full">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
            <DialogDescription>
              Crie ou exclua categorias para classificar e organizar seus produtos no PDV.
            </DialogDescription>
          </DialogHeader>

          {/* Form to create Category */}
          <form onSubmit={handleSaveCategory} className="space-y-3 pb-4 border-b">
            <div className="space-y-1">
              <Label htmlFor="cat_name">Nome da Nova Categoria</Label>
              <Input
                id="cat_name"
                placeholder="Ex: Utilidades"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat_desc">Descrição</Label>
              <Input
                id="cat_desc"
                placeholder="Breve descrição"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="space-y-1 flex-1">
                <Label>Cor de Destaque na UI</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="h-8 w-12 rounded cursor-pointer border border-muted"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{newCategoryColor}</span>
                </div>
              </div>
              <Button type="submit" size="sm" disabled={isSavingCategory} className="mt-auto bg-indigo-600 hover:bg-indigo-700 text-white">
                {isSavingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                Adicionar
              </Button>
            </div>
          </form>

          {/* Categories List */}
          <div className="space-y-3 max-h-60 overflow-y-auto pt-2">
            <h4 className="text-sm font-semibold">Categorias Cadastradas</h4>
            {categories.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma categoria cadastrada.</p>
            ) : (
              <div className="divide-y">
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color || "#ccc" }}
                      />
                      <div>
                        <p className="font-medium">{cat.name}</p>
                        {cat.description && (
                          <p className="text-[10px] text-muted-foreground">{cat.description}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)} className="w-full">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
