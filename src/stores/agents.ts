import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useIpc } from '../composables/useIpc';

export interface AgentDefinition {
  id: string;
  name: string;
  level: 'L1' | 'L2';
  department: string;
  description: string;
  tools: string[];
  color: string;
  model: 'opus' | 'sonnet' | 'haiku';
  manages: string[];
  reportsTo: string;
  coordinatesWith: string[];
  filePath: string;
}

export interface AgentDetail extends AgentDefinition {
  systemPrompt: string;
  sessionCount: number;
  totalCost: number;
}

export interface Department {
  id: string;
  name: string;
  color: string;
  agentCount: number;
}

/** Agent ID → 專屬圖示 */
const AGENT_ICONS: Record<string, string> = {
  // 工程部
  'tech-lead': '👨‍💻',
  'backend-architect': '🏗️',
  'frontend-developer': '🖥️',
  'mobile-app-builder': '📱',
  'ai-engineer': '🤖',
  'rapid-prototyper': '⚡',
  'devops-automator': '🔧',
  'infrastructure-maintainer': '🛠️',
  // 設計部
  'design-director': '🎨',
  'ui-designer': '🖌️',
  'ux-researcher': '🔬',
  'visual-storyteller': '📸',
  'brand-guardian': '🛡️',
  'whimsy-injector': '✨',
  // 產品部
  'product-manager': '📋',
  'feedback-synthesizer': '💬',
  'sprint-prioritizer': '🎯',
  'trend-researcher': '📈',
  // 行銷部
  'marketing-lead': '📣',
  'content-creator': '✍️',
  'app-store-optimizer': '🏪',
  'tiktok-strategist': '🎵',
  // 測試部
  'qa-lead': '🧪',
  'test-writer-fixer': '🧬',
  'api-tester': '🔌',
  'performance-benchmarker': '⏱️',
  'test-results-analyzer': '📊',
  'tool-evaluator': '🔍',
  'workflow-optimizer': '⚙️',
  // 專案管理部
  'project-lead': '👔',
  'project-shipper': '🚀',
  'studio-producer': '🎬',
  'experiment-tracker': '🧮',
  // 工作室營運
  'operations-lead': '🏢',
  'finance-tracker': '💰',
  'analytics-reporter': '📉',
  'legal-compliance-checker': '⚖️',
  'support-responder': '🎧',
  'context-manager': '🧠',
  'studio-coach': '🏅',
  // 公司管理
  'company-manager': '📚',
  // 特殊
  'joker': '🃏',
};

/** Agent ID → 繁體中文顯示名稱 */
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  // 工程部
  'tech-lead': '技術主管',
  'backend-architect': '後端架構師',
  'frontend-developer': '前端工程師',
  'mobile-app-builder': '行動應用工程師',
  'ai-engineer': 'AI 工程師',
  'rapid-prototyper': '快速原型師',
  'devops-automator': 'DevOps 工程師',
  'infrastructure-maintainer': '基礎設施維護師',
  // 設計部
  'design-director': '設計總監',
  'ui-designer': 'UI 設計師',
  'ux-researcher': 'UX 研究員',
  'visual-storyteller': '視覺敘事師',
  'brand-guardian': '品牌守護者',
  'whimsy-injector': '趣味注入師',
  // 產品部
  'product-manager': '產品經理',
  'feedback-synthesizer': '回饋分析師',
  'sprint-prioritizer': '衝刺排序師',
  'trend-researcher': '趨勢研究員',
  // 行銷部
  'marketing-lead': '行銷主管',
  'content-creator': '內容創作者',
  'app-store-optimizer': '應用商店優化師',
  'tiktok-strategist': 'TikTok 策略師',
  // 測試部
  'qa-lead': 'QA 主管',
  'test-writer-fixer': '測試工程師',
  'api-tester': 'API 測試師',
  'performance-benchmarker': '效能測試師',
  'test-results-analyzer': '測試結果分析師',
  'tool-evaluator': '工具評估師',
  'workflow-optimizer': '流程優化師',
  // 專案管理部
  'project-lead': '專案主管',
  'project-shipper': '專案交付師',
  'studio-producer': '工作室製作人',
  'experiment-tracker': '實驗追蹤師',
  // 工作室營運
  'operations-lead': '營運主管',
  'finance-tracker': '財務追蹤師',
  'analytics-reporter': '分析報表師',
  'legal-compliance-checker': '法務合規師',
  'support-responder': '客服回應師',
  'context-manager': '情境管理師',
  'studio-coach': '工作室教練',
  // 公司管理
  'company-manager': '公司知識管理者',
  // 特殊
  'joker': '百搭牌',
};

/** Agent ID → 繁體中文簡介（取代 YAML 中的英文 description） */
const AGENT_BRIEF: Record<string, string> = {
  // 工程部
  'tech-lead': '工程部門最高負責人，負責技術決策、架構設計、Code Review 與任務分配，向老闆直接匯報。',
  'backend-architect': '設計 API、資料庫與伺服器架構，確保後端服務穩定、安全且可擴展。',
  'frontend-developer': '實作使用者介面、Vue/React 元件開發、狀態管理與前端效能優化。',
  'mobile-app-builder': '開發 iOS / Android 原生或跨平台行動應用，處理推播、手勢與裝置適配。',
  'ai-engineer': '整合 AI/ML 功能，包括語言模型串接、推薦系統與智慧自動化。',
  'rapid-prototyper': '快速搭建 MVP 或概念驗證原型，在最短時間內把想法變成可執行的 Demo。',
  'devops-automator': '建置 CI/CD 流程、雲端基礎設施配置、監控告警與自動化部署。',
  'infrastructure-maintainer': '監控系統健康狀態、優化效能、管理擴容策略與災難預防。',
  // 設計部
  'design-director': '設計部門負責人，統籌設計方向、品牌一致性與使用者體驗策略。',
  'ui-designer': '設計介面元件、建立設計系統、確保視覺美觀與可用性。',
  'ux-researcher': '進行使用者研究、行為分析與旅程繪製，驗證設計決策。',
  'visual-storyteller': '將數據與概念轉化為引人入勝的視覺敘事，製作資訊圖表與簡報。',
  'brand-guardian': '建立品牌準則、維護視覺一致性、管理品牌資產與形象演進。',
  'whimsy-injector': 'UI 完成後自動注入趣味元素，讓使用者體驗充滿驚喜與愉悅。',
  // 產品部
  'product-manager': '產品部門負責人，負責需求管理、Sprint 規劃與跨部門協調。',
  'feedback-synthesizer': '分析多管道使用者回饋，歸納模式並轉化為可執行的產品洞察。',
  'sprint-prioritizer': '規劃 6 天開發週期，排定功能優先順序與取捨決策。',
  'trend-researcher': '研究市場趨勢、TikTok 熱門話題與 App Store 模式，挖掘產品機會。',
  // 行銷部
  'marketing-lead': '行銷部門負責人，統籌行銷策略、品牌推廣與社群經營。',
  'content-creator': '跨平台內容生產，從部落格長文到社群貼文，維持品牌調性與最大化影響力。',
  'app-store-optimizer': '優化 App Store 商品頁、關鍵字研究與轉換率提升，最大化自然搜尋曝光。',
  'tiktok-strategist': '制定 TikTok 行銷策略、開發病毒式內容創意與演算法優化。',
  // 測試部
  'qa-lead': '測試部門負責人，統籌測試策略、品質標準與 Bug 管理流程。',
  'test-writer-fixer': '撰寫單元/整合測試、分析失敗原因並修復，確保測試覆蓋率達標。',
  'api-tester': '針對 API 端點進行自動化測試，驗證回應格式、錯誤處理與邊界條件。',
  'performance-benchmarker': '執行效能基準測試、負載測試，找出瓶頸並提出優化建議。',
  'test-results-analyzer': '分析測試執行結果、追蹤覆蓋率趨勢與品質指標。',
  'tool-evaluator': '評估開發工具與第三方套件，提供採用建議與風險分析。',
  'workflow-optimizer': '優化開發流程與自動化工作流，減少手動操作與等待時間。',
  // 專案管理部
  'project-lead': '專案管理部門負責人，統籌跨部門協調、資源分配與進度追蹤。',
  'project-shipper': '負責上線前最後一哩路，協調發布流程、市場推廣與 Go-to-Market 策略。',
  'studio-producer': '跨團隊資源調度、工作流優化與 Sprint 週期內的依賴管理。',
  'experiment-tracker': '追蹤 A/B 測試與功能實驗，分析結果並提出迭代建議。',
  // 工作室營運
  'operations-lead': '營運部門負責人，統籌財務、法務、客服與整體營運效率。',
  'finance-tracker': '管理預算、成本優化、營收預測與財務績效分析。',
  'analytics-reporter': '分析營運數據、產生洞察報告，提供數據驅動的決策建議。',
  'legal-compliance-checker': '審查服務條款、隱私政策、確保法規合規與使用者信任。',
  'support-responder': '處理客服諮詢、建立支援文件與分析常見問題模式。',
  'context-manager': '管理跨 Session 的上下文記憶，確保資訊在 Agent 之間正確傳遞。',
  'studio-coach': '團隊績效教練，在複雜專案啟動時協調 Agent 合作與士氣激勵。',
  // 公司管理
  'company-manager': '跨子專案知識收集與提煉，彙整踩坑紀錄、與老闆討論通用問題，更新公司知識庫規範。',
  // 特殊
  'joker': '團隊氣氛調節者，用幽默和創意為高壓工作帶來歡笑與靈感。',
};

export const useAgentsStore = defineStore('agents', () => {
  const ipc = useIpc();

  const agents = ref<AgentDefinition[]>([]);
  const departments = ref<Department[]>([]);
  const filterDepartment = ref<string | null>(null);
  const filterLevel = ref<string | null>(null);
  const filterSearch = ref('');
  const loading = ref(false);

  const filteredAgents = computed(() => {
    let result = agents.value;

    if (filterDepartment.value) {
      result = result.filter((a) => a.department === filterDepartment.value);
    }
    if (filterLevel.value) {
      result = result.filter((a) => a.level === filterLevel.value);
    }
    if (filterSearch.value) {
      const q = filterSearch.value.toLowerCase();
      result = result.filter(
        (a) =>
          a.id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q),
      );
    }

    return result;
  });

  const agentsByDepartment = computed(() => {
    const map = new Map<string, AgentDefinition[]>();
    for (const agent of filteredAgents.value) {
      const list = map.get(agent.department) || [];
      list.push(agent);
      map.set(agent.department, list);
    }
    return map;
  });

  const agentCount = computed(() => agents.value.length);

  async function fetchAll() {
    loading.value = true;
    try {
      agents.value = (await ipc.listAgents()) as AgentDefinition[];
    } catch (err) {
      console.error('Failed to fetch agents', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchDepartments() {
    try {
      departments.value = (await ipc.getDepartments()) as Department[];
    } catch (err) {
      console.error('Failed to fetch departments', err);
    }
  }

  async function getDetail(id: string): Promise<AgentDetail | null> {
    try {
      return (await ipc.getAgent(id)) as AgentDetail;
    } catch (err) {
      console.error('Failed to get agent detail', err);
      return null;
    }
  }

  function getById(id: string): AgentDefinition | undefined {
    return agents.value.find((a) => a.id === id);
  }

  function setFilterDepartment(dept: string | null) {
    filterDepartment.value = dept;
  }

  function setFilterLevel(level: string | null) {
    filterLevel.value = level;
  }

  function setFilterSearch(search: string) {
    filterSearch.value = search;
  }

  /** 取得 Agent 的中文顯示名稱，找不到時 fallback 為原始 name/id */
  function displayName(agentOrId: string | AgentDefinition): string {
    const id = typeof agentOrId === 'string' ? agentOrId : agentOrId.id;
    return AGENT_DISPLAY_NAMES[id] || id;
  }

  /** 取得 Agent 的專屬圖示 */
  function agentIcon(agentOrId: string | AgentDefinition): string {
    const id = typeof agentOrId === 'string' ? agentOrId : agentOrId.id;
    return AGENT_ICONS[id] || '🤖';
  }

  /** 取得 Agent 的中文簡介，找不到時 fallback 為原始 description */
  function agentBrief(agentOrId: string | AgentDefinition): string {
    const id = typeof agentOrId === 'string' ? agentOrId : agentOrId.id;
    if (AGENT_BRIEF[id]) return AGENT_BRIEF[id];
    const agent = typeof agentOrId === 'string' ? agents.value.find((a) => a.id === id) : agentOrId;
    return agent?.description || '';
  }

  return {
    // State
    agents,
    departments,
    filterDepartment,
    filterLevel,
    filterSearch,
    loading,
    // Computed
    filteredAgents,
    agentsByDepartment,
    agentCount,
    // Actions
    fetchAll,
    fetchDepartments,
    getDetail,
    getById,
    setFilterDepartment,
    setFilterLevel,
    setFilterSearch,
    displayName,
    agentIcon,
    agentBrief,
  };
});
