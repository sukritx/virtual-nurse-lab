import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae2 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };
        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        setLanguage(event.target.value);
    };

    const content = {
        ja: {
            title: "シナリオ2：基礎看護学：酸素療法：酸素マスク着用時の看護",
            subtitle: "",
            description: "患者は田中一郎さん（仮名）、72歳男性。身長168cm、体重65kg。肺炎により入院3日目。発熱と咳嗽が続き、本日早朝から呼吸困難感が増強したため、医師より酸素マスクによる酸素療法（5L/分）が開始された。既往歴にCOPD（慢性閉塞性肺疾患）、高血圧、2型糖尿病がある。アレルギーはなし。\n初期バイタルサイン：T 38.2°C・BP 146/82 mmHg・P 108/min・RR 28/min・SpO₂ 85%（ルームエアー）・JCS 0\n酸素療法後：マスク5L/分・SpO₂ 92%・RR 24/min\n検査：WBC 14,200/μL・CRP 12.8 mg/dL・PaO₂ 58 mmHg・PaCO₂ 48 mmHg・pH 7.36\n薬剤：セフトリアキソン静注・アセトアミノフェン・チオトロピウム吸入・アムロジピン",
            questions: [
                "設問1（初期観察）：酸素マスク装着後、最優先で観察すべき項目を3つ挙げ、その理由を説明してください。",
                "設問2（コミュニケーション）：「このマスク、苦しくて外したいんだけど……。」患者の不安に配慮しながら、酸素療法継続の必要性を説明してください。",
                "設問3（看護介入）：①酸素マスク装着中の患者に実施すべき看護ケアを3つ挙げてください。②SpO₂ 88%、呼吸数32回/分、患者「ますます苦しい」との訴え。看護学生としてどう対処しますか。　選択肢：A. そのまま経過観察する　B. マスクの装着状態と酸素流量を確認し、医師へ報告する　C. 酸素マスクを外して鼻カニューレへ変更する　D. 患者を仰臥位にする"
            ]
        },
        en: {
            title: "Scenario 2: Fundamental Nursing - Oxygen Therapy: Care of a Patient Wearing an Oxygen Mask",
            subtitle: "",
            description: "The patient is Mr. Ichiro Tanaka (pseudonym), a 72-year-old man. Height 168 cm, weight 65 kg. He is on day 3 of hospitalization for pneumonia. Fever and cough have persisted, and his sense of breathing difficulty worsened from early this morning, so the physician started oxygen therapy via an oxygen mask (5 L/min). His history includes COPD, hypertension, and type 2 diabetes mellitus. No allergies.\nInitial vital signs: T 38.2°C · BP 146/82 mmHg · P 108/min · RR 28/min · SpO₂ 85% (room air) · JCS 0\nAfter oxygen therapy: mask 5 L/min · SpO₂ 92% · RR 24/min\nLabs: WBC 14,200/μL · CRP 12.8 mg/dL · PaO₂ 58 mmHg · PaCO₂ 48 mmHg · pH 7.36\nMedications: ceftriaxone IV · acetaminophen · tiotropium inhalation · amlodipine",
            questions: [
                "Q1 (Initial observation): After the mask is applied, list the three highest-priority items to observe and explain the reason for each.",
                "Q2 (Communication): The patient says, \"This mask is so uncomfortable that I want to take it off...\" Showing consideration for his anxiety, explain why oxygen therapy must be continued.",
                "Q3 (Nursing interventions): (1) List three nursing care measures for a patient wearing an oxygen mask. (2) SpO₂ is 88%, RR 32/min, and the patient says \"It is getting harder to breathe.\" As a nursing student, how do you respond? Choices: A. Continue observation without further action. B. Check the mask fit and oxygen flow rate, and report to the physician. C. Remove the oxygen mask and change to a nasal cannula. D. Place the patient in the supine position."
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={2}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_2_Oxygen_Therapy.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae2;
