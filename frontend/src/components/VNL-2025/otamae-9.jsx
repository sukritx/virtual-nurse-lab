import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae9 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab9 = response.data.labs.find(lab => lab.labInfo.labNumber === 9);
                if (lab9) {
                    setAttemptsLeft(lab9.attemptsLeft);
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
            title: "シナリオ9：成人看護学（急性看護学）：胃がん術後1日目の看護",
            subtitle: "",
            description: "患者A氏、56歳、男性。診断名：胃がん。3か月前から心窩部痛があり受診、検査（胃内視鏡・CT等）で胃がん（肉眼的分類3型・潰瘍浸潤型）と診断され手術目的で入院。身長170cm、体重75kg（3か月前は80kg）。4人家族：妻（52歳）、長男（20歳）、次男（16歳）、妻は毎日面会。職業：会社員（コンピュータ会社の管理職）。性格：元々せっかち。\n手術および術後経過：麻酔：全身麻酔＋硬膜外麻酔　・術式：腹腔鏡下幽門側胃切除術＋リンパ節郭清、Billroth I　・手術時間3時間\nウィンスロー孔ドレーン（閉鎖式プリーツ型）；術直後はフェイスマスク酸素3L/分；覚醒良好；ドレーン排液は中等量血性；硬膜外モルヒネで創部痛は耐えられる程度；胃管からのコーヒー残渣様排液\n術後1日目の状態：ウィンスロー孔ドレーン留置中・胃管14Fr（左鼻腔、術後2日目抜去予定）・持続点滴（左前腕）・硬膜外モルヒネ・酸素は8:00に中止・尿道カテーテル14Fr\nバイタルサイン：T 37.5°C・SpO₂ 97%（ルームエアー）・BP 126/62 mmHg・P 90/min（不整脈なし）・RR 22/min（浅い）・副雑音なし・少量の粘稠な痰\n腹部：腸蠕動音聴取不可、排ガスなし、嘔気嘔吐なし・創部：硬膜外モルヒネで痛みは耐えられる程度、出血なし、周囲発赤なし、ドレーン排液50mL淡血性\n検査：WBC 12,800/μL・RBC 3.55 M/μL・Hb 10.1 g/dL・Hct 31.2%・Plt 271,000/μL・TP 5.5・Alb 3.0・Na 132・K 3.9・Cl 100・glucose 135 mg/dL・CRP 12.5 mg/dL\n患者の発言：「動いたら管が抜けたり、傷口が開かないですか。咳をするだけでも傷が痛いのに、動いたらどうなるんだろうと想像するだけでも怖いです。」",
            questions: [
                "術後1日目の患者の初回離床で、看護学生としてどのように患者の全身状態を評価し、離床の援助を行いますか？"
            ]
        },
        en: {
            title: "Scenario 9: Adult Nursing (Acute Care) - Care on Postoperative Day 1 After Gastric Cancer Surgery",
            subtitle: "",
            description: "Patient A, a 56-year-old man. Diagnosis: gastric cancer. He had epigastric pain from 3 months ago; investigations (endoscopy, CT) diagnosed gastric cancer (macroscopic type 3, ulcerative-infiltrative) and he was admitted for surgery. Height 170 cm, weight 75 kg (80 kg three months ago). Family of four: wife (52), eldest son (20), second son (16); wife visits daily. Occupation: company manager (computer company). Personality: impatient by nature.\nSurgery & Postoperative Course: Anesthesia: general + epidural · Procedure: laparoscopic distal subtotal gastrectomy + lymph node dissection, Billroth I · Operative time 3 h\nWinslow's foramen drain (closed pleated type); face-mask O₂ 3 L/min immediately post-op; good emergence; moderate bloody drain output; epidural morphine keeps wound pain tolerable; coffee-ground drainage from gastric tube\nCondition on Postoperative Day 1: Winslow's drain in place · gastric tube 14 Fr (L nostril, remove POD 2) · continuous IV (L forearm) · epidural morphine · O₂ stopped 08:00 · indwelling urinary catheter 14 Fr\nVital signs: T 37.5°C · SpO₂ 97% (room air) · BP 126/62 mmHg · P 90/min (no arrhythmia) · RR 22/min (shallow) · no adventitious sounds · small viscous sputum\nAbdomen: bowel sounds not audible, no flatus, no nausea/vomiting · Wound: pain tolerable on epidural morphine, no bleeding, no surrounding redness, 50 mL light-bloody drain output\nLabs: WBC 12,800/μL · RBC 3.55 M/μL · Hb 10.1 g/dL · Hct 31.2% · Plt 271,000/μL · TP 5.5 · Alb 3.0 · Na 132 · K 3.9 · Cl 100 · glucose 135 mg/dL · CRP 12.5 mg/dL\nPatient's statement: \"If I move, won't the tubes come out or the wound open? Even coughing makes the wound hurt, so just imagining what would happen if I moved is frightening.\"",
            questions: [
                "For this patient's first mobilization out of bed on postoperative day 1, how would you, as a nursing student, assess the patient's general condition and assist with mobilization?"
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={9}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_9_Postoperative_Gastric_Cancer_Care.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae9;
