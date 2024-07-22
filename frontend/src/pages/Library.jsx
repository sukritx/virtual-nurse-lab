import { Link } from 'react-router-dom';
import img1 from '../assets/GettyImages-1289379328.png';

const blogs = [
    {
        id: 1,
        time: "5 Minute Read",
        title: "Top CMU Online Courses for Nursing",
        description: "Courses for high school and college graduates looking for their next step.",
        image: img1
    },
    {
        id: 2,
        time: "5 Minute Read",
        title: "Elevate Your Potential: The Ultimate Course Guide for Young Professionals",
        description: "Promotion readiness shouldn't be a distant aspiration but a goal that you can start working toward now.",
        image: img1
    },
    {
        id: 3,
        time: "4 Minute Read",
        title: "Empowering Leadership Excellence: Top Harvard Online Courses for Managers and Aspiring Executives",
        description: "Courses for leaders across industries that will give you the competencies essential for succeeding in these management and executive positions.",
        image: img1
    },
    {
        id: 4,
        time: "3 Minute Read",
        title: "Top 10 Online Courses for Personal Development",
        description: "A list of the best online courses for learners who are ready to take the next step in their journey of self-discovery and personal growth.",
        image: img1
    },
    {
        id: 5,
        time: "3 Minute Read",
        title: "Harvard Online’s Most Fun Courses",
        description: "Yes, learning can be fun! Here are our most fun and best-loved courses.",
        image: img1
    },
    {
        id: 6,
        time: "3 Minute Read",
        title: "Top 10 Harvard Online Courses for Business Professionals",
        description: "We have compiled a list of our top courses for goal-oriented business professionals who are ready to take the next step in their professional development.",
        image: img1
    }
];

const Library = () => {
    return (
        <div className="min-h-screen flex flex-col">
            <div className="flex flex-col items-center justify-center py-10">
                <div className="w-full max-w-6xl mt-6">
                    <h1 className="text-3xl font-bold mb-6 text-center">Virtual Nurse Lab Library</h1>
                    <p className="text-center mb-8">Learn with Virtual Nurse Lab Online</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {blogs.map((blog, index) => (
                            <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden">
                                <img src={blog.image} alt={blog.title} className="w-full h-48 object-cover"/>
                                <div className="p-6">
                                    <p className="text-sm text-gray-600">{blog.time}</p>
                                    <h2 className="text-xl font-semibold text-purple-700 mt-2">
                                        <Link to={`/library/${blog.id}`}>{blog.title}</Link>
                                    </h2>
                                    <p className="mt-2 text-gray-700">{blog.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Library;
