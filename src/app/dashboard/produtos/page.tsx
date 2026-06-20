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
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

const PRODUCT_IMAGES_BUCKET = "product-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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
  const filteredProducts = products.filter((prod) => {
    const matchesSearch =
      prod.name.toLowerCase().includes(search.toLowerCase()) ||
      prod.sku?.toLowerCase().includes(search.toLowerCase()) ||
      prod.barcode?.toLowerCase().includes(search.toLowerCase());

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
    setIsProductDialogOpen(true);
  }

  // Open Dialog to Edit Product
  function handleEditProduct(product: Product) {
    setEditingProduct(product);
    resetImageState(product.image_url);
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
        stock_quantity: parseInt(productForm.stock_quantity) || 0,
        min_stock: parseInt(productForm.min_stock) || 0,
        unit: productForm.unit,
        is_active: productForm.is_active,
        image_url: imageUrl,
      };

      if (editingProduct) {
        // Update
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingProduct.id);

        if (error) throw error;

        // Limpa a imagem antiga do bucket se foi trocada ou removida
        if (
          (imageFile || imageRemoved) &&
          currentImageUrl &&
          currentImageUrl !== imageUrl
        ) {
          await removeImageFromBucket(currentImageUrl);
        }
        toast.success("Produto atualizado com sucesso!");
      } else {
        // Create
        const { error } = await supabase.from("products").insert(payload);

        if (error) throw error;
        toast.success("Produto cadastrado com sucesso!");
      }

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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
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
                  const isLowStock = prod.stock_quantity <= prod.min_stock;
                  return (
                    <TableRow key={prod.id} className="hover:bg-muted/30">
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
                          <div>
                            <p className="font-semibold">{prod.name}</p>
                            {prod.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {prod.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        <div className="space-y-0.5">
                          {prod.sku && <p>SKU: {prod.sku}</p>}
                          {prod.barcode && <p>BC: {prod.barcode}</p>}
                          {!prod.sku && !prod.barcode && <p className="text-xs italic">-</p>}
                        </div>
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
                            {prod.stock_quantity} {prod.unit}
                          </span>
                          {isLowStock && (
                            <span title="Estoque baixo!">
                              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        R$ {prod.cost_price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-indigo-500">
                        R$ {prod.sale_price.toFixed(2)}
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
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteProduct(prod.id)}
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
                  <div className="space-y-1.5">
                    <input
                      id="product-image"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById("product-image")?.click()}
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      {imagePreview ? "Trocar imagem" : "Enviar imagem"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, WEBP ou GIF. Máx. 5MB.
                    </p>
                  </div>
                </div>
              </div>

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
                <Input
                  id="barcode"
                  placeholder="EAN-13"
                  value={productForm.barcode}
                  onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })}
                />
              </div>

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
