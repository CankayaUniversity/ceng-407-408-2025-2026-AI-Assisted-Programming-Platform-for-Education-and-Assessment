from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, problems, execute, ai

app = FastAPI(title="AI Programming Platform API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(problems.router, prefix="/problems", tags=["Problems"])
app.include_router(execute.router, prefix="/execute", tags=["Code Execution"])
app.include_router(ai.router, prefix="/ai", tags=["AI Integration"])

@app.get("/health")
def health_check():
    return {"status": "healthy", "message": "Backend ayakta!"}
