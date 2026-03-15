import type { BuiltinEntityTypeName } from '@ledra/types';

const entityTypeLabels: Record<BuiltinEntityTypeName, string> = {
  site: 'サイト',
  segment: 'セグメント',
  vlan: 'VLAN',
  prefix: 'プレフィックス',
  allocation: 'アロケーション',
  host: 'ホスト',
  service: 'サービス',
  dns_record: 'DNS レコード'
};

export const uiCopy = {
  brand: {
    title: 'Ledra',
    subtitle: 'ネットワーク・レジストリ・ビューア'
  },
  nav: {
    list: '一覧',
    scopes: 'スコープ'
  },
  routes: {
    overview: '一覧',
    explore: '一覧',
    scopes: 'スコープ'
  },
  actions: {
    openExplore: '探索を始める',
    openScope: 'スコープを開く',
    openWorkspace: 'ワークスペースへ戻る',
    backToResults: '結果に戻る',
    clearFilters: '絞り込みを解除',
    openNode: 'ノードを開く'
  },
  labels: {
    generatedAt: '生成日時',
    sourceBundle: '配信 bundle',
    mode: '配信モード',
    entities: 'ノード',
    relations: '関係',
    scopes: 'スコープ',
    policies: 'ポリシー',
    currentScope: '現在のスコープ',
    allScopes: '全スコープ',
    allNodes: 'すべてのノード',
    search: '検索',
    searchPlaceholder: 'タイトル、ID、タグ、属性を検索',
    typeRange: '対象タイプ',
    visible: '件表示',
    relationCount: '関連数',
    sourceFile: 'ソースファイル',
    tags: 'タグ',
    attributes: '属性',
    context: 'コンテキスト',
    incoming: '入力側',
    outgoing: '出力側',
    graph: '関係グラフ'
  },
  table: {
    node: 'ノード',
    type: '種別',
    relationCount: '関係数',
    tags: 'タグ',
    attributes: '主要属性',
    action: '操作',
    openDetail: '詳細'
  },
  system: {
    toggle: 'システム情報を表示',
    title: 'システム情報',
    bundlePath: 'bundle パス',
    generatedAt: '生成日時',
    mode: '配信モード',
    entities: 'ノード数',
    relations: '関係数',
    scopes: 'スコープ数',
    policies: 'ポリシー数'
  },
  status: {
    loadingTitle: '公開 bundle を読み込んでいます',
    loadingBody: 'ルート構造と探索データを整えています。',
    errorTitle: '`/bundle.json` を読み込めませんでした',
    notFoundTitle: 'このページは公開中の viewer に存在しません',
    notFoundBody: 'ワークスペースへ戻るか、探索から利用可能なノードを開いてください。',
    scopeNotFoundTitle: '指定したスコープは見つかりません',
    scopeNotFoundBody: '利用可能なスコープを選び直してください。',
    nodeNotFoundTitle: '指定したノードは bundle に存在しません',
    nodeNotFoundBody: '探索画面へ戻り、既知のノードから開き直してください。',
    noResultsTitle: '条件に一致するノードがありません',
    noResultsBody: '検索語かスコープを変えると、別の関係が見つかる場合があります。',
    noRelationsBody: 'このノードに結び付く関係は現在の bundle では見つかりません。'
  }
} as const;

export const formatEntityTypeLabel = (type: string): string => {
  if (type in entityTypeLabels) {
    return entityTypeLabels[type as BuiltinEntityTypeName];
  }

  return type.replace(/_/g, ' ');
};

export const formatAttributeValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
};

export const formatGeneratedAt = (value: string): string => {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};
