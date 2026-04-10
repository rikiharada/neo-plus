// js/industries.js
window.INDUSTRIES = [
    { id: 'transport_truck', name: '一般貨物自動車運送業', type: 'transportation', deadlineLabel: '配達完了日' },
    { id: 'service_event', name: 'イベント企画・運営', type: 'service', deadlineLabel: 'イベント開催日' },
    { id: 'art_illustrator', name: 'イラストレーター', type: 'art', deadlineLabel: 'ラフ/完成納品日' },
    { id: 'food_restaurant', name: '飲食店（レストラン・居酒屋）', type: 'food', deadlineLabel: '宴会・予約日' },
    { id: 'it_software', name: 'IT・ソフトウェア開発', type: 'it', deadlineLabel: 'ローンチ予定日' },
    { id: 'it_maintenance', name: 'IT保守・運用サポート', type: 'it', deadlineLabel: '更新予定日' },
    { id: 'it_web', name: 'Web制作・デザイン', type: 'it', deadlineLabel: '公開予定日' },
    { id: 'freelance_video', name: '映像制作・動画編集', type: 'freelance', deadlineLabel: '完パケ納品日' },
    { id: 'beauty_esthetic', name: 'エステティックサロン', type: 'beauty', deadlineLabel: '来店予定日' },
    { id: 'art_music', name: '音楽制作・クリエイター', type: 'art', deadlineLabel: 'マスタリング完了' },
    { id: 'transport_cargo', name: '貨物軽自動車運送業', type: 'transportation', deadlineLabel: '配達完了日' },
    { id: 'service_education', name: '教育・学習支援（塾・教室）', type: 'learning', deadlineLabel: '受講予定日' },
    { id: 'food_catering', name: 'ケータリング・仕出し', type: 'food', deadlineLabel: '提供予定日' },
    { id: 'construction_general', name: '建設・建築', type: 'construction', deadlineLabel: '工事完了予定日' },
    { id: 'retail_apparel', name: '小売（アパレル・雑貨）', type: 'retail', deadlineLabel: '納品予定日' },
    { id: 'freelance_consultant', name: 'コンサルタント', type: 'freelance', deadlineLabel: '報告完了予定' },
    { id: 'it_infra', name: 'サーバー・インフラ構築', type: 'it', deadlineLabel: '構築完了予定' },
    { id: 'transport_taxi', name: 'タクシー・ハイヤー', type: 'transportation', deadlineLabel: '乗車予定日' },
    { id: 'food_takeout', name: 'テイクアウト・デリバリー', type: 'food', deadlineLabel: '配達予定日' },
    { id: 'beauty_nail', name: 'ネイル・まつげサロン', type: 'beauty', deadlineLabel: '来店予定日' },
    { id: 'retail_ec', name: 'ネットショップ・EC', type: 'retail', deadlineLabel: '発送予定日' },
    { id: 'art_performer', name: '俳優・パフォーマー', type: 'art', deadlineLabel: '出演・本番日' },
    { id: 'service_cleaning', name: 'ハウスクリーニング・清掃', type: 'service', deadlineLabel: '清掃完了予定' },
    { id: 'beauty_salon', name: '美容室・ヘアサロン', type: 'beauty', deadlineLabel: '来店予定日' },
    { id: 'freelance_photographer', name: 'フォトグラファー・カメラマン', type: 'freelance', deadlineLabel: '撮影・納品予定' },
    { id: 'freelance_writer', name: 'ライター・編集者', type: 'freelance', deadlineLabel: '入稿締切日' },
    { id: 'other_general', name: 'その他', type: 'general', deadlineLabel: '予定日' }
];

window.getIndustryLabel = function (industryId) {
    const found = window.INDUSTRIES.find(i => i.id === industryId);
    return found ? found.deadlineLabel : '予定日';
};
