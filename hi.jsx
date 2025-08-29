import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, getDocs, addDoc } from 'firebase/firestore';

// Main App Component
const App = () => {
  // Global Firebase variables provided by the environment
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // State hooks
  const [tasks, setTasks] = useState([]); // Stores all tasks fetched from Firestore
  const [newTask, setNewTask] = useState(''); // Stores the value of the new task input field
  const [db, setDb] = useState(null); // Firestore instance
  const [auth, setAuth] = useState(null); // Auth instance
  const [userId, setUserId] = useState(null); // Current user's ID
  const [isAuthReady, setIsAuthReady] = useState(false); // Flag to ensure Firebase is ready
  const [selectedTask, setSelectedTask] = useState(null); // Task for the details modal
  const [isModalOpen, setIsModalOpen] = useState(false); // Modal state
  const [filter, setFilter] = useState('all'); // Filter state

  // Initialize Firebase and set up authentication listener
  useEffect(() => {
    // Initialize Firebase app if config is available
    if (Object.keys(firebaseConfig).length > 0) {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
      setAuth(authInstance);
      setDb(dbInstance);

      // Listen for authentication state changes
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          // If no user is authenticated, try to sign in
          try {
            if (initialAuthToken) {
              const userCredential = await signInWithCustomToken(authInstance, initialAuthToken);
              setUserId(userCredential.user.uid);
            } else {
              const userCredential = await signInAnonymously(authInstance);
              setUserId(userCredential.user.uid);
            }
          } catch (error) {
            console.error("Firebase auth error:", error);
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    }
  }, [firebaseConfig, initialAuthToken]);

  // Set up real-time Firestore listener
  useEffect(() => {
    // Only fetch data if Firebase and user ID are ready
    if (db && userId) {
      // The collection path for public, collaborative data
      const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
      
      // Listen for real-time changes to the tasks collection
      const unsubscribe = onSnapshot(tasksCollectionRef, (snapshot) => {
        const fetchedTasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTasks(fetchedTasks);
      }, (error) => {
        console.error("Firestore onSnapshot error:", error);
      });

      // Cleanup listener on component unmount
      return () => unsubscribe();
    }
  }, [db, userId, appId]);

  // Handle initial data population if the database is empty
  useEffect(() => {
    const populateInitialData = async () => {
      if (db && userId) {
        const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
        const snapshot = await getDocs(tasksCollectionRef);
        if (snapshot.empty) {
          // Add initial tasks
          const initialTasks = [
            { content: "Plan team meeting agenda", status: 'todo' },
            { content: "Review and merge pull requests", status: 'in-progress' },
            { content: "Update project documentation", status: 'done' },
          ];
          initialTasks.forEach(async (task) => {
            await addDoc(tasksCollectionRef, task);
          });
        }
      }
    };
    if (isAuthReady) {
      populateInitialData();
    }
  }, [db, userId, isAuthReady, appId]);

  // Handle adding a new task to Firestore
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!db || !newTask.trim()) return;

    try {
      const tasksCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'tasks');
      const docRef = doc(tasksCollectionRef); // Create a new document with an auto-generated ID
      
      await setDoc(docRef, {
        content: newTask.trim(),
        status: 'todo', // New tasks always start in 'todo'
      });
      setNewTask(''); // Clear input field
    } catch (error) {
      console.error("Error adding task:", error);
    }
  };

  // Handle task deletion
  const handleDeleteTask = async (taskId) => {
    if (!db || !taskId) return;
    try {
      const taskDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId);
      await deleteDoc(taskDocRef);
      setIsModalOpen(false); // Close modal after deletion
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  // Drag and drop handlers
  const onDragStart = (e, id) => {
    e.dataTransfer.setData('taskId', id);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = async (e, newStatus) => {
    e.preventDefault();
    if (!db) return;

    const taskId = e.dataTransfer.getData('taskId');
    const draggedTask = tasks.find(task => task.id === taskId);
    if (!draggedTask || draggedTask.status === newStatus) return;

    try {
      const taskDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'tasks', taskId);
      await updateDoc(taskDocRef, {
        status: newStatus,
      });
    } catch (error) {
      console.error("Error updating task status:", error);
    }
  };

  // Filter tasks based on the current filter state
  const getFilteredTasks = (status) => {
    if (filter === 'all' || filter === status) {
      return tasks.filter(task => task.status === status);
    }
    return [];
  };

  // Render a single column for the Kanban board
  const renderColumn = (status, title) => {
    const columnTasks = getFilteredTasks(status);
    return (
      <div 
        className="flex-1 bg-gray-100 p-4 rounded-xl shadow-md space-y-4"
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, status)}
      >
        <h2 className="text-xl font-bold text-gray-800 text-center">{title}</h2>
        <div className="min-h-[100px] flex-grow space-y-3">
          {columnTasks.map(task => (
            <div
              key={task.id}
              className="bg-white p-4 rounded-lg shadow cursor-grab hover:shadow-lg transition-shadow duration-200"
              draggable="true"
              onDragStart={(e) => onDragStart(e, task.id)}
              onClick={() => {
                setSelectedTask(task);
                setIsModalOpen(true);
              }}
            >
              {task.content}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Image Slider Component
  const Slider = () => {
    const images = [
      { url: 'https://placehold.co/1000x500/A0B2C4/FFFFFF?text=Teamwork+makes+the+dream+work', caption: 'Teams working together achieve great results.' },
      { url: 'https://placehold.co/1000x500/E5D9C4/4A5568?text=Focus+on+what+matters', caption: 'Stay focused on your most important tasks.' },
      { url: 'https://placehold.co/1000x500/C4D4E5/3B5A79?text=Celebrate+your+successes', caption: 'Recognize every step of progress you make.' },
    ];
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const sliderRef = useRef(null);

    // Auto-play feature for the slider
    useEffect(() => {
      const interval = setInterval(() => {
        setCurrentImageIndex(prevIndex => (prevIndex + 1) % images.length);
      }, 5000); // Change image every 5 seconds

      return () => clearInterval(interval);
    }, [images.length]);

    const nextImage = () => setCurrentImageIndex((currentImageIndex + 1) % images.length);
    const prevImage = () => setCurrentImageIndex((currentImageIndex - 1 + images.length) % images.length);

    return (
      <div className="mt-12 bg-gray-200 p-6 rounded-xl shadow-lg relative overflow-hidden">
        <h3 className="text-2xl font-bold text-gray-800 text-center mb-6">Inspiration Gallery</h3>
        <div className="relative">
          <img
            src={images[currentImageIndex].url}
            alt="Slider"
            className="w-full h-auto rounded-xl shadow-md transition-opacity duration-1000"
          />
          <div className="absolute inset-0 flex justify-between items-center px-4">
            <button
              onClick={prevImage}
              className="bg-black bg-opacity-30 text-white p-2 rounded-full hover:bg-opacity-50 transition"
            >
              &#9664;
            </button>
            <button
              onClick={nextImage}
              className="bg-black bg-opacity-30 text-white p-2 rounded-full hover:bg-opacity-50 transition"
            >
              &#9654;
            </button>
          </div>
        </div>
        <p className="mt-4 text-center text-lg font-medium text-gray-700">{images[currentImageIndex].caption}</p>
      </div>
    );
  };

  // Main UI
  return (
    <div className="flex flex-col min-h-screen bg-cover bg-fixed" style={{ backgroundImage: "url('https://placehold.co/1920x1080/C4D4E5/3B5A79?text=Collaboration')" }}>
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Collaborative Kanban Board</h1>
          {userId && (
            <div className="text-sm">
              <span className="font-semibold">Your User ID:</span> {userId}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto p-6 flex-grow">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Team Productivity Dashboard
        </h2>
        
        {/* Filter Buttons */}
        <div className="flex justify-center gap-4 mb-8">
          <button 
            className={`py-2 px-4 rounded-lg font-semibold ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button 
            className={`py-2 px-4 rounded-lg font-semibold ${filter === 'todo' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
            onClick={() => setFilter('todo')}
          >
            To Do
          </button>
          <button 
            className={`py-2 px-4 rounded-lg font-semibold ${filter === 'in-progress' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
            onClick={() => setFilter('in-progress')}
          >
            In Progress
          </button>
          <button 
            className={`py-2 px-4 rounded-lg font-semibold ${filter === 'done' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
            onClick={() => setFilter('done')}
          >
            Done
          </button>
        </div>

        {/* Kanban Board Columns */}
        <div className="flex flex-col lg:flex-row gap-6">
          {renderColumn('todo', 'To Do')}
          {renderColumn('in-progress', 'In Progress')}
          {renderColumn('done', 'Done')}
        </div>

        {/* Task input form */}
        <form onSubmit={handleAddTask} className="mt-8 flex items-center justify-center gap-4">
          <input
            type="text"
            className="flex-grow max-w-lg p-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
            placeholder="Add a new task..."
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:bg-blue-700 transition duration-300"
          >
            Add Task
          </button>
        </form>
      </main>

      {/* Task Details Modal */}
      {isModalOpen && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-11/12 md:w-1/3 space-y-4">
            <h3 className="text-xl font-bold text-gray-800">Task Details</h3>
            <p className="text-gray-600">{selectedTask.content}</p>
            <div className="flex justify-end gap-2">
              <button
                className="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition"
                onClick={() => handleDeleteTask(selectedTask.id)}
              >
                Delete Task
              </button>
              <button
                className="bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Image Slider Component */}
      <div className="container mx-auto px-6 pb-6">
        <Slider />
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 text-white p-4 text-center">
        &copy; 2025 Collaborative Kanban Board.
      </footer>
    </div>
  );
};
function Hi() {
  return (
    <div>
      <h1>Welcome to My Travel Website 🌍✈️</h1>
      <p>This content is coming from hi.jsx</p>
    </div>
  );
}
function Hi() {
  return <h1>Hello from Hi Component</h1>;
}

function App() {
  return <h1>Hello from App Component</h1>;
}

// yaha sirf ek hi default hoga
export default App;

// aur dusra named export
export { Hi };
import App, { Hi } from "./hi";


