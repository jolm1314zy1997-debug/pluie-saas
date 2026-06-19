import * as XLSX from 'xlsx';
import type { EnrichedLead } from '@/context/AppContext';

/**
 * 客户背调表格导出。
 * 单 sheet 多分区结构，业务员保存到本地或转发给主管都直观。
 * 文件名 = 公司名 + 日期 + 后缀。
 */

type Row = (string | number | null | undefined)[];

function sectionHeader(title: string): Row[] {
  return [
    [],
    [`【${title}】`],
  ];
}

function safeFilename(name: string): string {
  // Windows / macOS 都不允许的字符：< > : " / \ | ? *  以及控制字符
  const cleaned = (name || 'lead').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return cleaned.slice(0, 80) || 'lead';
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function buildLeadWorkbook(lead: EnrichedLead): XLSX.WorkBook {
  const rows: Row[] = [];

  // ── 基本信息 ──
  rows.push(['客户背调报告', '']);
  rows.push(['公司名称', lead.company || '']);
  rows.push(['官网', lead.website || '']);
  rows.push(['国家', lead.country || '']);
  rows.push(['标签', (lead.tags || []).join(' / ')]);
  rows.push(['研究模式', lead.researchMode === 'fast' ? '速搜（~15s）' : '详细']);
  rows.push(['生成时间', new Date().toLocaleString('zh-CN')]);

  // ── 真实性警告 ──
  if (lead.websiteReality?.suspicious) {
    rows.push(...sectionHeader('⚠️ 公司真实性警告'));
    rows.push(['提示', lead.websiteReality.note || '']);
    rows.push(['建议', '先 Google 搜公司名 + 国家确认真实性，再决定是否发邮件或拨打电话']);
  }

  // ── 联系方式 ──
  rows.push(...sectionHeader('联系方式'));
  rows.push(['类型', '值', '已验证', '来源', '验证备注']);
  if (lead.contacts && lead.contacts.length > 0) {
    for (const c of lead.contacts) {
      rows.push([
        c.type || '',
        c.value || '',
        c.verified ? '✓' : '',
        c.source || '',
        c.verificationNote || '',
      ]);
    }
  } else {
    rows.push(['（未抓到联系方式）', '', '', '', '']);
  }

  // ── 财务实力 ──
  if (lead.businessProfile) {
    rows.push(...sectionHeader('财务实力'));
    rows.push(['年营收', lead.businessProfile.annual_revenue || '']);
    rows.push(['净利润', lead.businessProfile.net_profit || '']);
    rows.push(['人员规模', lead.businessProfile.employee_count || '']);
    rows.push(['规模判定', lead.businessProfile.scale_judgment || '']);
    rows.push(['信息来源', lead.businessProfile.evidence_source || '']);
  }

  // ── 主推产品 ──
  if (Array.isArray(lead.hotSellers) && lead.hotSellers.length > 0) {
    rows.push(...sectionHeader('主推产品'));
    rows.push(['名称', '类别', '当前价', '价格信号']);
    for (const p of lead.hotSellers) {
      rows.push([p.name || '', p.category || '', p.price_current || '', p.price_signal || '']);
    }
  }

  // ── 关键决策人 ──
  if (lead.decisionMaker) {
    rows.push(...sectionHeader('关键决策人'));
    rows.push(['姓名', lead.decisionMaker.name || '']);
    rows.push(['推测角色', lead.decisionMaker.role_guess || '']);
    rows.push(['性格信号', lead.decisionMaker.personality_signal || '']);
    rows.push(['触达方式', lead.decisionMaker.outreach_handle || '']);
  }

  // ── 软件生态 ──
  if (lead.softwareEcosystem) {
    rows.push(...sectionHeader('软件生态'));
    rows.push(['判定', lead.softwareEcosystem.verdict || '']);
    rows.push(['证据', lead.softwareEcosystem.evidence || '']);
    rows.push(['切入压力', lead.softwareEcosystem.switch_pressure || '']);
  }

  // ── 合规风险 ──
  if (lead.complianceRisk) {
    rows.push(...sectionHeader('合规风险'));
    rows.push(['关键法规', (lead.complianceRisk.key_regulations || []).join(' / ')]);
    rows.push(['平台风险', lead.complianceRisk.platform_risk || '']);
    rows.push(['必备认证', (lead.complianceRisk.must_have_certs || []).join(' / ')]);
  }

  // ── 竞争定位 ──
  if (lead.competitivePosition) {
    rows.push(...sectionHeader('竞争定位'));
    rows.push(['类型', lead.competitivePosition.type || '']);
    rows.push(['差异化', lead.competitivePosition.key_differentiator || '']);
    rows.push(['客户画像', lead.competitivePosition.customer_profile_short || '']);
  }

  // ── 供应商更替信号 ──
  if (Array.isArray(lead.supplierChangeSignals) && lead.supplierChangeSignals.length > 0) {
    rows.push(...sectionHeader('供应商更替信号'));
    lead.supplierChangeSignals.forEach((s, i) => rows.push([`信号 ${i + 1}`, s]));
  }

  // ── 谈判破冰策略 ──
  if (Array.isArray(lead.negotiationPlaybook) && lead.negotiationPlaybook.length > 0) {
    rows.push(...sectionHeader('🚀 临门一脚谈判策略'));
    rows.push(['#', '切入角度', '依据', '英文话术', '中文依据', 'KB 引用']);
    lead.negotiationPlaybook.forEach((p, i) => {
      rows.push([
        i + 1,
        p.angle || '',
        p.rationale || '',
        p.opening_script_en || '',
        p.opening_script_zh || '',
        Array.isArray(p.kb_citations) ? p.kb_citations.join(' / ') : '',
      ]);
    });
  }

  // ── 关联站点 ──
  if (Array.isArray(lead.relatedSites) && lead.relatedSites.length > 0) {
    rows.push(...sectionHeader('关联站点'));
    rows.push(['域名', '标题', 'URL', '命中线索', '摘要']);
    for (const s of lead.relatedSites) {
      rows.push([s.domain || '', s.title || '', s.url || '', s.matched_via || '', s.snippet || '']);
    }
  }

  // ── 执行摘要 / 背景资料 ──
  rows.push(...sectionHeader('执行摘要'));
  rows.push([lead.deepProfile || '（未生成）']);

  if (lead.customerBackgroundInfo) {
    rows.push(...sectionHeader('客户原始背景资料'));
    rows.push([lead.customerBackgroundInfo]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 列宽——按经验给前 5 列设一个合理宽度，避免业务员打开后一片挤压
  ws['!cols'] = [
    { wch: 18 },
    { wch: 38 },
    { wch: 12 },
    { wch: 38 },
    { wch: 38 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '客户背调');
  return wb;
}

export function downloadLeadReport(lead: EnrichedLead): void {
  const wb = buildLeadWorkbook(lead);
  const filename = `${safeFilename(lead.company)}-背调-${todayStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
}
