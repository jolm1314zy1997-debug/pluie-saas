'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder,
  Image as ImageIcon,
  FileText,
  Upload,
  Download,
  Copy,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  X,
  Check,
  Box,
  Camera,
  Building2,
  Users,
  Award,
  Package,
  Plus,
  ExternalLink,
  KeyRound,
  LogOut,
  Store,
  Video,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';

/* ────────────── 类型 + 常量 ────────────── */

export interface MaterialItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  product: string | null;
  tags: string[];
  file_path: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  thumbnail_url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const CATEGORIES: Array<{ value: string; label: string; icon: typeof Folder; color: string }> = [
  { value: 'all', label: '全部', icon: Folder, color: 'bg-charcoal-100 text-charcoal-700' },
  { value: '产品实拍图', label: '产品实拍图', icon: Camera, color: 'bg-brand-100 text-brand-700' },
  { value: '产品规格书', label: '产品规格书', icon: FileText, color: 'bg-blue-100 text-blue-700' },
  { value: '展会图片', label: '展会图片', icon: ImageIcon, color: 'bg-amber-100 text-amber-700' },
  { value: '展厅图片', label: '展厅图片', icon: Store, color: 'bg-rose-100 text-rose-700' },
  { value: '客户合影', label: '客户合影', icon: Users, color: 'bg-pink-100 text-pink-700' },
  { value: '工厂图片', label: '工厂图片', icon: Building2, color: 'bg-emerald-100 text-emerald-700' },
  { value: '视频', label: '视频', icon: Video, color: 'bg-red-100 text-red-700' },
  { value: '认证证书', label: '认证证书', icon: Award, color: 'bg-violet-100 text-violet-700' },
  { value: '包装物流', label: '包装/物流', icon: Package, color: 'bg-orange-100 text-orange-700' },
  { value: '其他', label: '其他', icon: Box, color: 'bg-charcoal-100 text-charcoal-600' },
];

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB / 文件，视频也够
const TEAM_KEY_STORAGE = 'qzt_materials_team_key';
const UPLOADER_NAME_STORAGE = 'qzt_materials_uploader';

function categoryMeta(value: string) {
  return CATEGORIES.find((c) => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
}

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isImage(file_type: string | null): boolean {
  return Boolean(file_type && file_type.startsWith('image/'));
}

function isVideo(file_type: string | null): boolean {
  return Boolean(file_type && file_type.startsWith('video/'));
}

/* ────────────── 主组件 ────────────── */

export default function MaterialsLibrary() {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configMissing, setConfigMissing] = useState(false);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [productFilter, setProductFilter] = useState('');

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewItem, setPreviewItem] = useState<MaterialItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 团队口令 + 上传人昵称（仅在 localStorage 里）
  const [teamKey, setTeamKey] = useState<string>('');
  const [uploaderName, setUploaderName] = useState<string>('');

  // 第一次进入时从 localStorage 恢复
  useEffect(() => {
    try {
      const k = localStorage.getItem(TEAM_KEY_STORAGE);
      if (k) setTeamKey(k);
      const u = localStorage.getItem(UPLOADER_NAME_STORAGE);
      if (u) setUploaderName(u);
    } catch {}
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConfigMissing(false);
    try {
      const params = new URLSearchParams();
      if (activeCategory !== 'all') params.set('category', activeCategory);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (productFilter.trim()) params.set('product', productFilter.trim());
      const res = await fetch(`/api/materials?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.config_missing) setConfigMissing(true);
        throw new Error(data?.detail || `服务器错误 (${res.status})`);
      }
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载物料库失败');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, searchQuery, productFilter]);

  // 首次进入 + 筛选变化时拉取
  useEffect(() => {
    const t = setTimeout(refetch, 200);
    return () => clearTimeout(t);
  }, [refetch]);

  /* ── 上传完成回调 ── */
  const handleUploadSuccess = (newItem: MaterialItem) => {
    setItems((prev) => [newItem, ...prev]);
  };

  /* ── 团队口令保存 ── */
  const saveTeamKey = (k: string) => {
    const trimmed = k.trim();
    setTeamKey(trimmed);
    try {
      if (trimmed) localStorage.setItem(TEAM_KEY_STORAGE, trimmed);
      else localStorage.removeItem(TEAM_KEY_STORAGE);
    } catch {}
  };

  const saveUploaderName = (n: string) => {
    const trimmed = n.trim();
    setUploaderName(trimmed);
    try {
      if (trimmed) localStorage.setItem(UPLOADER_NAME_STORAGE, trimmed);
      else localStorage.removeItem(UPLOADER_NAME_STORAGE);
    } catch {}
  };

  /* ── 删除 ── */
  const handleDelete = async (item: MaterialItem) => {
    if (!teamKey) {
      toast.error('需要团队口令才能删除');
      setShowUploadModal(true); // 借上传模态框的口令字段
      return;
    }
    if (!confirm(`确认删除「${item.title}」？文件会从 R2 一起清掉，不可恢复。`)) return;
    try {
      const res = await fetch(`/api/materials?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        headers: { 'X-Team-Key': teamKey },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `服务器错误 (${res.status})`);
      setItems((prev) => prev.filter((m) => m.id !== item.id));
      if (previewItem?.id === item.id) setPreviewItem(null);
      toast.success('已删除');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  /* ── 复制链接 ── */
  const handleCopyLink = (item: MaterialItem) => {
    navigator.clipboard.writeText(item.file_url);
    setCopiedId(item.id);
    toast.success('文件链接已复制（直接粘到 WhatsApp / 邮件即可）');
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ── 下载 ── */
  // 走我们自己的中转 API：服务端从 R2 拿流转给浏览器，加 Content-Disposition: attachment
  // 强制浏览器存盘。同源响应，<a download> 也生效。比直接 fetch R2 公开 URL 更可靠
  // （R2 公开 URL 的 CORS 不一定全开，导致跨域 fetch 失败回退到新窗口打开）。
  const handleDownload = (item: MaterialItem) => {
    const ext = (item.file_path.split('.').pop() || '').slice(0, 5);
    const baseName = item.title || item.file_path.split('/').pop() || 'material';
    const filename = ext && !baseName.toLowerCase().endsWith('.' + ext.toLowerCase())
      ? `${baseName}.${ext}`
      : baseName;
    const url = `/api/materials/download?path=${encodeURIComponent(item.file_path)}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /* ── 各分类计数 ── */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of items) counts[m.category] = (counts[m.category] || 0) + 1;
    return counts;
  }, [items]);

  /* ── 后端没配 R2 ── */
  if (configMissing) {
    return (
      <div className="card p-12 text-center animate-fade-in-up">
        <Folder size={48} className="mx-auto mb-3 text-cream-400" />
        <h3 className="text-lg font-display text-charcoal-600 mb-2">物料库后端还没接上</h3>
        <p className="text-sm text-charcoal-400 max-w-xl mx-auto leading-relaxed">
          物料库用 Cloudflare R2 存文件（10GB 免费，客户下载完全 0 流量费）。<br />
          请按 <code className="px-1.5 py-0.5 rounded bg-cream-100 text-charcoal-600">supabase/materials-setup.md</code> 在 Cloudflare 建桶 + Vercel 加 6 个环境变量，重新部署后即可使用。
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* 标题区 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-display font-semibold text-charcoal-800">物料库</h2>
          <p className="mt-1 text-sm text-charcoal-500">
            产品实拍图 / 规格书 / 展会图 / 客户合影 / 工厂图 / 认证证书 — 业务员开发客户时直接调取
          </p>
        </div>
        <div className="flex items-center gap-2">
          {teamKey && (
            <button
              onClick={() => {
                saveTeamKey('');
                toast.info('已退出上传模式');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-cream-300 bg-white text-xs text-charcoal-500 hover:bg-cream-50 transition-colors"
              title="清掉本机的团队口令"
            >
              <LogOut size={13} />
              退出上传
            </button>
          )}
          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-charcoal-900 text-white text-sm font-semibold hover:bg-charcoal-800 transition-colors"
          >
            <Upload size={16} />
            上传素材
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">加载失败</p>
            <p className="text-xs mt-0.5 text-red-600">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="p-1 rounded hover:bg-red-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 搜索 + 产品筛选 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题 / 描述 / 产品 / 标签..."
            className="input-field pl-9"
          />
        </div>
        <div className="relative">
          <Box size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-400" />
          <input
            type="text"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            placeholder="只看某个产品型号（如 S820 / Tuya DIY Module）..."
            className="input-field pl-9"
          />
        </div>
      </div>

      {/* 分类按钮 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = activeCategory === c.value;
          const count = c.value === 'all' ? items.length : categoryCounts[c.value] || 0;
          return (
            <button
              key={c.value}
              onClick={() => setActiveCategory(c.value)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                active
                  ? 'bg-charcoal-900 text-white border-charcoal-900 shadow-sm'
                  : 'bg-white text-charcoal-600 border-cream-300 hover:border-charcoal-400'
              )}
            >
              <Icon size={12} />
              {c.label}
              {count > 0 && (
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.5 text-[10px]',
                    active ? 'bg-white/20 text-white' : 'bg-cream-100 text-charcoal-500'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 网格 */}
      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card aspect-[4/5] animate-pulse bg-cream-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center">
          <Folder size={48} className="mx-auto mb-3 text-cream-400" />
          <h3 className="text-lg font-display text-charcoal-500 mb-2">物料库还是空的</h3>
          <p className="text-sm text-charcoal-400 max-w-md mx-auto">
            点击右上角「上传素材」开始添加产品实拍图、规格书 PDF、展会图等
          </p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-charcoal-900 text-white text-xs font-semibold hover:bg-charcoal-800 transition-colors"
          >
            <Upload size={14} />
            上传第一个素材
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((m) => {
            const meta = categoryMeta(m.category);
            const Icon = meta.icon;
            const isImg = isImage(m.file_type);
            const isVid = isVideo(m.file_type);
            return (
              <div
                key={m.id}
                className="card overflow-hidden group hover:border-brand-300 hover:shadow-elegant-md transition-all flex flex-col"
              >
                <button
                  onClick={() => setPreviewItem(m)}
                  className="relative aspect-[4/3] bg-cream-100 overflow-hidden"
                  title="点击预览大图"
                >
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.thumbnail_url || m.file_url}
                      alt={m.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : isVid ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-brand-500 bg-charcoal-900/90">
                      <div className="text-4xl">▶</div>
                      <span className="text-[10px] mt-2 uppercase tracking-wider text-white/70">视频</span>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-charcoal-400">
                      <FileText size={36} />
                      <span className="text-[10px] mt-2 uppercase tracking-wider">
                        {m.file_type?.split('/')[1] || 'file'}
                      </span>
                    </div>
                  )}
                  <span
                    className={clsx(
                      'absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm',
                      meta.color
                    )}
                  >
                    <Icon size={10} />
                    {meta.label}
                  </span>
                </button>
                <div className="p-3 flex-1 flex flex-col gap-1.5">
                  <h4 className="font-semibold text-sm text-charcoal-800 truncate" title={m.title}>
                    {m.title}
                  </h4>
                  {m.product && <p className="text-[11px] text-charcoal-500 truncate">{m.product}</p>}
                  {m.description && <p className="text-[11px] text-charcoal-400 line-clamp-2">{m.description}</p>}
                  {m.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {m.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-cream-100 text-charcoal-500">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-auto pt-2 flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(m)}
                      title="下载"
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-charcoal-700 bg-cream-50 hover:bg-cream-100 transition-colors"
                    >
                      <Download size={11} />
                      下载
                    </button>
                    <button
                      onClick={() => handleCopyLink(m)}
                      title="复制公开链接（贴 WhatsApp / 邮件）"
                      className={clsx(
                        'flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors',
                        copiedId === m.id
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'text-charcoal-700 bg-cream-50 hover:bg-cream-100'
                      )}
                    >
                      {copiedId === m.id ? <Check size={11} /> : <Copy size={11} />}
                      {copiedId === m.id ? '已复制' : '复制链接'}
                    </button>
                    {teamKey && (
                      <button
                        onClick={() => handleDelete(m)}
                        title="删除（需要团队口令）"
                        className="inline-flex items-center justify-center w-7 h-7 rounded text-charcoal-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-charcoal-300 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{humanSize(m.file_size)}</span>
                    <span>·</span>
                    <span>{new Date(m.uploaded_at).toLocaleDateString('zh-CN')}</span>
                    {m.uploaded_by && (
                      <>
                        <span>·</span>
                        <span>{m.uploaded_by}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 上传 Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={(item) => {
            handleUploadSuccess(item);
            setShowUploadModal(false);
          }}
          teamKey={teamKey}
          setTeamKey={saveTeamKey}
          uploaderName={uploaderName}
          setUploaderName={saveUploaderName}
        />
      )}

      {/* 预览 Modal */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onDownload={() => handleDownload(previewItem)}
          onCopyLink={() => handleCopyLink(previewItem)}
        />
      )}
    </div>
  );
}

/* ────────────── 上传 Modal ────────────── */

interface UploadModalProps {
  onClose: () => void;
  onSuccess: (item: MaterialItem) => void;
  teamKey: string;
  setTeamKey: (k: string) => void;
  uploaderName: string;
  setUploaderName: (n: string) => void;
}

function UploadModal({
  onClose,
  onSuccess,
  teamKey,
  setTeamKey,
  uploaderName,
  setUploaderName,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('产品实拍图');
  const [product, setProduct] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onPickFile = (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      setPreviewSrc(null);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(`文件超过 ${MAX_FILE_BYTES / 1024 / 1024}MB，请压缩或拆分后再传`);
      return;
    }
    setFile(f);
    if (!title) {
      const name = f.name.replace(/\.[^.]+$/, '');
      setTitle(name);
    }
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      setPreviewSrc(url);
    } else {
      setPreviewSrc(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onPickFile(f);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!teamKey.trim()) {
      setError('请先填团队口令（问公司销售管理员要）');
      return;
    }
    if (!file) {
      setError('请先选择一个文件');
      return;
    }
    if (!title.trim()) {
      setError('请填一个标题');
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      // 1. 服务端拿一个 presigned PUT URL
      setProgress(10);
      const presignRes = await fetch('/api/materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Team-Key': teamKey,
        },
        body: JSON.stringify({
          action: 'presign',
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          category,
        }),
      });
      const presignData = await presignRes.json().catch(() => null);
      if (!presignRes.ok) {
        if (presignRes.status === 401) {
          throw new Error('团队口令错误，请确认或问销售管理员');
        }
        throw new Error(presignData?.detail || `presign 失败 (${presignRes.status})`);
      }
      const { upload_url, file_path, file_url, content_type } = presignData as {
        upload_url: string;
        file_path: string;
        file_url: string;
        content_type: string;
      };

      // 2. 浏览器直传 R2，进度用 XHR 拿
      setProgress(20);
      await uploadToR2WithProgress(upload_url, file, content_type, (pct) => {
        // 20% → 90% 之间映射上传进度
        setProgress(20 + Math.round(pct * 0.7));
      });

      // 3. 提交元数据到 manifest
      setProgress(95);
      const tags = tagsRaw
        .split(/[,，;；\s]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      const registerRes = await fetch('/api/materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Team-Key': teamKey,
        },
        body: JSON.stringify({
          action: 'register',
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          product: product.trim() || undefined,
          tags,
          file_path,
          file_url,
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by: uploaderName.trim() || undefined,
        }),
      });
      const registerData = await registerRes.json().catch(() => null);
      if (!registerRes.ok) {
        throw new Error(registerData?.detail || `落 manifest 失败 (${registerRes.status})`);
      }
      setProgress(100);
      toast.success('上传成功');
      onSuccess(registerData.item as MaterialItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-900/50 backdrop-blur-sm animate-fade-in-up">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto card p-6 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-semibold text-charcoal-800">
            上传素材到物料库
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-cream-100 text-charcoal-400 hover:text-charcoal-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* 团队口令 + 上传人——记忆在 localStorage 里，只填一次 */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-cream-50 border border-cream-200">
          <div>
            <label className="label flex items-center gap-1">
              <KeyRound size={12} />
              团队口令 *
            </label>
            <input
              type="password"
              className="input-field text-sm"
              value={teamKey}
              onChange={(e) => setTeamKey(e.target.value)}
              placeholder="问销售管理员要"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">你的名字（可选）</label>
            <input
              type="text"
              className="input-field text-sm"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder="例如：Pluie / 销售一部"
            />
          </div>
          <p className="md:col-span-2 text-[10px] text-charcoal-400">
            口令记在本浏览器里，下次不用再填。换电脑/换浏览器需要重新输入一次。
          </p>
        </div>

        {/* 拖拽区 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            file ? 'border-brand-300 bg-brand-50/30' : 'border-cream-300 hover:border-brand-300 hover:bg-cream-50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,video/*"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
          />
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc} alt="预览" className="mx-auto max-h-40 rounded shadow" />
          ) : file ? (
            <div className="flex flex-col items-center gap-2 text-charcoal-600">
              <FileText size={36} />
              <span className="text-sm font-medium">{file.name}</span>
              <span className="text-xs text-charcoal-400">{humanSize(file.size)}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-charcoal-500">
              <Upload size={32} />
              <p className="text-sm font-medium">点击或拖拽文件到这里</p>
              <p className="text-xs text-charcoal-400">支持图片 / PDF / 视频，单文件 ≤ 500MB</p>
            </div>
          )}
        </div>

        {/* 表单 */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">标题 *</label>
            <input
              type="text"
              className="input-field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：S820 摄像头模组 30度俯视实拍"
            />
          </div>

          <div>
            <label className="label">分类</label>
            <select
              className="input-field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">产品型号（可选）</label>
            <input
              type="text"
              className="input-field"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="例如：S820 / Tuya DIY Module"
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">描述（可选）</label>
            <textarea
              className="input-field min-h-[60px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="客户视角的简短说明：用什么场景能用上、有什么卖点"
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">
              标签（可选）
              <span className="text-[10px] font-normal text-charcoal-400">逗号 / 空格分隔</span>
            </label>
            <input
              type="text"
              className="input-field"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="例如：WiFi, 4K, 夜视, 室内"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {uploading && (
          <div className="mt-3">
            <div className="h-1.5 bg-cream-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-400 to-emerald-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-charcoal-400 mt-1">上传中... {progress}%</p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg border border-cream-300 bg-white text-sm text-charcoal-600 hover:bg-cream-50 disabled:opacity-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || !file || !teamKey.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-charcoal-900 text-white text-sm font-semibold hover:bg-charcoal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                上传中
              </>
            ) : (
              <>
                <Plus size={14} />
                确认上传
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────── 浏览器直传 R2，带 onProgress ────────────── */

function uploadToR2WithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = (event.loaded / event.total) * 100;
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 上传失败 (HTTP ${xhr.status}) ${xhr.responseText?.slice(0, 200) || ''}`));
      }
    };
    xhr.onerror = () => reject(new Error('上传中断（网络/CORS 问题）'));
    xhr.send(file);
  });
}

/* ────────────── 预览 Modal ────────────── */

function PreviewModal({
  item,
  onClose,
  onDownload,
  onCopyLink,
}: {
  item: MaterialItem;
  onClose: () => void;
  onDownload: () => void;
  onCopyLink: () => void;
}) {
  const isImg = isImage(item.file_type);
  const isVid = isVideo(item.file_type);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal-900/70 backdrop-blur-sm animate-fade-in-up"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto card p-4 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 backdrop-blur hover:bg-white text-charcoal-600 shadow-sm"
        >
          <X size={16} />
        </button>
        <div
          className="bg-cream-100 rounded-lg overflow-hidden mb-4 flex items-center justify-center"
          style={{ minHeight: '50vh' }}
        >
          {isImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.file_url} alt={item.title} className="max-h-[60vh] object-contain" />
          ) : isVid ? (
            <video src={item.file_url} controls className="max-h-[60vh] max-w-full" />
          ) : (
            <div className="flex flex-col items-center gap-3 p-12 text-charcoal-400">
              <FileText size={64} />
              <a
                href={item.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-charcoal-900 text-white text-sm hover:bg-charcoal-800 transition-colors"
              >
                在新窗口打开
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-display font-semibold text-charcoal-800">{item.title}</h3>
              {item.product && <p className="text-xs text-charcoal-500 mt-0.5">{item.product}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onDownload}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cream-50 text-charcoal-700 text-xs font-medium hover:bg-cream-100 transition-colors"
              >
                <Download size={12} />
                下载
              </button>
              <button
                onClick={onCopyLink}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-charcoal-900 text-white text-xs font-medium hover:bg-charcoal-800 transition-colors"
              >
                <Copy size={12} />
                复制链接
              </button>
            </div>
          </div>
          {item.description && <p className="text-sm text-charcoal-600">{item.description}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-2 text-[11px] text-charcoal-400">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cream-100">
              {item.category}
            </span>
            {item.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full bg-cream-100">
                #{t}
              </span>
            ))}
            <span>·</span>
            <span>{humanSize(item.file_size)}</span>
            <span>·</span>
            <span>{new Date(item.uploaded_at).toLocaleString('zh-CN')}</span>
            {item.uploaded_by && (
              <>
                <span>·</span>
                <span>{item.uploaded_by}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
