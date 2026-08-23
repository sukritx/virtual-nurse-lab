import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import OtamaeRecordingComponent from './OtamaeRecordingComponent';

const MAX_ATTEMPTS = 3;

const Otamae3 = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('ja');
    const { token } = useAuth();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/otamae/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
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
            title: "シナリオ3：母性看護学：腹部観察",
            subtitle: "",
            description: "産科外来。22歳の妊婦（初産、妊娠31週）が定期健診のために来院した。胎動は良好、全身状態は正常。腹部診察の結果：子宮底高（FH）＝27cm、臍と剣状突起の間、胎向は第2胎向、頭部浮球感あり、胎児心拍数（FHR）＝138〜156bpm。",
            questions: [
                "腹部観察の目的を説明し、与えられた結果に基づいて視診・触診・聴診・計測診を実施してください。"
            ]
        },
        en: {
            title: "Scenario 3: Maternal Nursing - Abdominal Examination",
            subtitle: "",
            description: "A 22-year-old pregnant woman (primigravida, 31 weeks of gestation) has come to the obstetric outpatient clinic for a routine antenatal checkup. Fetal movements are good and her general condition is normal. Abdominal examination findings: fundal height (FH) = 27 cm (between the umbilicus and the xiphoid process); fetal position = second position; the fetal head is ballotable (floating); fetal heart rate (FHR) = 138-156 bpm.",
            questions: [
                "Explain the purposes of abdominal examination, then carry out inspection, palpation, auscultation, and measurement based on the given findings."
            ]
        }
    }[language];

    return (
        <OtamaeRecordingComponent
            labNumber={3}
            title={content.title}
            subtitle={content.subtitle}
            description={content.description}
            questions={content.questions}
            videoSrc="/otamae/Scenario_3_Abdominal_Examination.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Otamae3;
