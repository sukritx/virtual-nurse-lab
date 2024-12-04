import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

const Lab4RecordingEn = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('en');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 4);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };

        fetchLabInfo();
    }, [token]);

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/student/maternalchild1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild4en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild4jp');
        } else if (newLanguage === 'th') {
            navigate('/student/maternalchild4');
        }
    };

    const onSubmit = useCallback(async (recordedBlob) => {
        if (!recordedBlob || attemptsLeft === 0) return;

        try {
            const totalChunks = Math.ceil(recordedBlob.size / CHUNK_SIZE);
            const fileName = `lab4_recording_en_${Date.now()}.${recordedBlob.type.split('/')[1]}`;

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, recordedBlob.size);
                const chunk = recordedBlob.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('fileName', fileName);
                formData.append('chunkIndex', chunkIndex);
                formData.append('totalChunks', totalChunks);

                await axios.post('/api/v1/lab-deployed/upload-chunk', formData, {
                    headers: { 
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            await axios.post('/api/v1/lab-deployed/upload-4-en', {
                fileName,
                totalChunks
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setAttemptsLeft(prevAttempts => Math.max(0, prevAttempts - 1));

        } catch (error) {
            console.error('Error uploading video:', error);
        }
    }, [token, attemptsLeft]);

    return (
        <LabRecordingComponent
            labNumber={4}
            title="Lab 4: Family Planning"
            subtitle="Oral Contraceptive Pills"
            description="A 30-year-old mother, 5 days after delivering her first child, wants to exclusively breastfeed for at least 6 months and is concerned about postpartum contraception while breastfeeding."
            questions={[
                "How would you recommend an appropriate contraceptive method for this postpartum mother? Please suggest one method.",
                "If this postpartum mother is considering using progestin-only birth control pills, what advice would you give regarding the use of contraceptive pills, possible side effects, and appropriate solutions in case of missed doses?"
            ]}
            videoSrc="/maternalchild/situation4.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft} 
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            onSubmit={onSubmit}
        />
    );
};

export default Lab4RecordingEn;
