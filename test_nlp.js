const assert = require('assert');

// Extremely simple mock
window = {};
mockDB = { userConfig: { industry: 'general' } };
window.StaticLexicon = { categorizeExpense: () => 'other' };

// Paste parseCommand here
window.parseCommand = function (text) {
    let result = { date: null, location: null, title: text, category: "other" };
    let remainingText = text;

    const dateMatch = remainingText.match(/(\d{1,2})[月\/](\d{1,2})(?:日)?/);
    if (dateMatch) {
        remainingText = remainingText.replace(dateMatch[0], '');
    }

    const locMatch = remainingText.match(/(?:[には])?([^、。\sには]+?)(?:で|にて)/);
    if (locMatch) {
        result.location = locMatch[1].trim();
        remainingText = remainingText.replace(locMatch[0], '');
    }

    remainingText = remainingText.replace(/はいいた|はいいった/g, '入った');
    
    const noiseWordsRegex = /フォルダ作って|フォルダを作って|プロジェクトを作って|保存して|メモして|追加して|作成して|開始|ある|あります|作成|ファイル|新規|フォルダ|が入った|が決まった|する|入った|決定/g;
    
    remainingText = remainingText.replace(/^[、。\sにはでをが]+/g, '')
                                 .replace(/[、。\sが。]+$/g, '')
                                 .replace(noiseWordsRegex, '')
                                 .replace(/[をが。.]/g, '')
                                 .trim();
                                 
    if (remainingText.length > 0) {
        result.title = remainingText;
    } else {
        result.title = "新規プロジェクト";
    }
    return result;
};

// Tests
console.log(window.parseCommand('3月24日、銀座で工事が入った'));
// Expect: title '工事', loc '銀座'
console.log(window.parseCommand('上野で撮影スケジュールがはいいた'));
// Expect: title '撮影スケジュール', loc '上野'
console.log(window.parseCommand('新宿で面談フォルダ作って'));
// Expect: title '面談', loc '新宿'
console.log(window.parseCommand('12/15、大阪でライブする'));
// Expect: title 'ライブ', loc '大阪'
